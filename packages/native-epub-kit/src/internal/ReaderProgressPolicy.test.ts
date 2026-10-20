import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type {
  Locator,
  NavigationUnitDerivationInput,
  ReaderLocationEvent,
  ReaderProgressCheckpoint,
  ReaderProgressLocationEvent,
} from '../records';
import { deriveNavigationUnits } from './NavigationUnitPolicy';
import {
  calculateReaderProgress,
  createReaderProgressState,
  enrichReaderLocationEvent,
  readerProgressAnchorsAreMateriallyStable,
  updateReaderProgressState,
} from './ReaderProgressPolicy';

interface ProgressContractCase {
  event: ReaderLocationEvent;
  expected: {
    chapterProgress: number;
    overallProgress: number;
    position: number;
    precision: ReaderLocationEvent['precision'];
    title: string;
  };
  name: string;
}

interface ProgressContract {
  cases: ProgressContractCase[];
  navigation: NavigationUnitDerivationInput;
  version: 1;
}

const progressContract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/reader-progress-v1/cases.json', import.meta.url),
    'utf8'
  )
) as ProgressContract;

const link = (href: string, title: string) => ({ children: [], href, title });
const position = (href: string, ordinal: number, totalProgression: number): Locator => ({
  href,
  locations: { position: ordinal, totalProgression },
  type: 'application/xhtml+xml',
});

const positionedInput: NavigationUnitDerivationInput = {
  positions: [
    position('text/a.xhtml', 1, 0),
    position('text/a.xhtml', 2, 1 / 6),
    position('text/b.xhtml', 3, 2 / 6),
    position('text/b.xhtml', 4, 3 / 6),
    position('text/c.xhtml', 5, 4 / 6),
    position('text/c.xhtml', 6, 5 / 6),
  ],
  readingOrder: [link('text/a.xhtml', 'A'), link('text/b.xhtml', 'B'), link('text/c.xhtml', 'C')],
  tableOfContents: [
    link('text/a.xhtml', 'Chapter A'),
    link('text/b.xhtml', 'Chapter B'),
    link('text/c.xhtml', 'Chapter C'),
  ],
};

const positioned = {
  ...deriveNavigationUnits(positionedInput),
  generation: 4,
  instanceId: 'reader-progress',
};

const event = (
  overrides: Partial<ReaderLocationEvent> & Pick<ReaderLocationEvent, 'locator'>
): ReaderLocationEvent => ({
  generation: 4,
  instanceId: 'reader-progress',
  precision: 'continuous',
  reason: 'user-scroll',
  sequence: 1,
  ...overrides,
});

describe('reader-progress-v1 contract', () => {
  it('pins boundary membership, progress values, and fallback precision', () => {
    expect(progressContract.version).toBe(1);
    expect(progressContract.cases).toHaveLength(5);
    const navigation = {
      ...deriveNavigationUnits(progressContract.navigation),
      generation: 4,
      instanceId: 'reader-progress-contract',
    };

    for (const testCase of progressContract.cases) {
      const result = calculateReaderProgress(testCase.event, navigation);
      expect(result, testCase.name).not.toBeNull();
      expect(result?.navigationUnit.title, testCase.name).toBe(testCase.expected.title);
      expect(result?.precision, testCase.name).toBe(testCase.expected.precision);
      expect(result?.position, testCase.name).toBe(testCase.expected.position);
      expect(result?.chapterProgress, testCase.name).toBeCloseTo(
        testCase.expected.chapterProgress,
        10
      );
      expect(result?.overallProgress, testCase.name).toBeCloseTo(
        testCase.expected.overallProgress,
        10
      );
    }
  });
});

describe('reader progress membership and boundary values', () => {
  it('uses start-inclusive and end-exclusive continuous intervals', () => {
    const start = calculateReaderProgress(
      event({
        locator: position('text/a.xhtml', 1, 0),
        overallProgress: 0,
        position: 1,
        totalPositions: 6,
      }),
      positioned
    );
    const middle = calculateReaderProgress(
      event({
        locator: position('text/a.xhtml', 2, 1 / 6),
        overallProgress: 1 / 6,
        position: 2,
        sequence: 2,
        totalPositions: 6,
      }),
      positioned
    );
    const boundary = calculateReaderProgress(
      event({
        locator: position('text/b.xhtml', 3, 2 / 6),
        overallProgress: 2 / 6,
        position: 3,
        sequence: 3,
        totalPositions: 6,
      }),
      positioned
    );
    const end = calculateReaderProgress(
      event({
        locator: {
          ...position('text/c.xhtml', 6, 1),
          locations: { position: 6, progression: 1, totalProgression: 1 },
        },
        overallProgress: 1,
        position: 6,
        sequence: 4,
        totalPositions: 6,
      }),
      positioned
    );

    expect(start).toMatchObject({
      chapterProgress: 0,
      navigationUnit: { title: 'Chapter A' },
      overallProgress: 0,
      precision: 'continuous',
    });
    expect(middle).toMatchObject({
      chapterProgress: 0.5,
      navigationUnit: { title: 'Chapter A' },
      overallProgress: 1 / 6,
    });
    expect(boundary).toMatchObject({
      chapterProgress: 0,
      navigationUnit: { title: 'Chapter B' },
      overallProgress: 2 / 6,
    });
    expect(end).toMatchObject({
      chapterProgress: 1,
      navigationUnit: { title: 'Chapter C' },
      overallProgress: 1,
    });
  });

  it('uses position intervals without claiming continuous precision', () => {
    const result = calculateReaderProgress(
      event({
        locator: position('text/b.xhtml', 4, 3 / 6),
        overallProgress: 0.5,
        position: 4,
        precision: 'position',
        totalPositions: 6,
      }),
      positioned
    );
    expect(result).toMatchObject({
      chapterProgress: 0.5,
      navigationUnit: { title: 'Chapter B' },
      overallProgress: 0.5,
      position: 4,
      precision: 'position',
      totalPositions: 6,
    });
  });

  it('uses the visible start locator for a cross-unit viewport', () => {
    const result = calculateReaderProgress(
      event({
        locator: position('text/c.xhtml', 5, 4 / 6),
        overallProgress: 0.5,
        position: 5,
        visibleRange: {
          end: position('text/c.xhtml', 5, 4 / 6),
          start: position('text/b.xhtml', 4, 3 / 6),
        },
      }),
      positioned
    );
    expect(result).toMatchObject({
      navigationUnit: { title: 'Chapter B' },
      overallProgress: 0.5,
      position: 4,
    });
    expect(result?.chapterProgress).toBeCloseTo(0.5, 10);
    if (!result) throw new Error('Expected enriched progress.');
    expect(createReaderProgressState(result).current.locator.href).toBe('text/b.xhtml');
  });

  it('prefers canonical locator progress when a native viewport aggregate is stale', () => {
    const result = calculateReaderProgress(
      event({
        locator: position('text/b.xhtml', 4, 0.5),
        overallProgress: 0,
        position: 4,
        sequence: 8,
        totalPositions: 6,
      }),
      positioned
    );

    expect(result).toMatchObject({
      navigationUnit: { title: 'Chapter B' },
      overallProgress: 0.5,
      position: 4,
    });
    expect(result?.chapterProgress).toBeCloseTo(0.5, 10);
  });

  it('falls back to resource precision when positions are unavailable', () => {
    const resourceOnly = deriveNavigationUnits({
      positions: [],
      readingOrder: [link('text/a.xhtml', 'A'), link('text/b.xhtml', 'B')],
      tableOfContents: [],
    });
    const result = calculateReaderProgress(
      event({
        locator: {
          href: 'text/b.xhtml',
          locations: { progression: 0.25 },
          type: 'application/xhtml+xml',
        },
        precision: 'resource',
      }),
      resourceOnly
    );
    expect(result).toMatchObject({
      chapterProgress: 0.25,
      navigationUnit: { source: 'reading-order-fallback', title: 'B' },
      overallProgress: 0.625,
      precision: 'resource',
    });
    expect(result?.position).toBeUndefined();
    expect(result?.totalPositions).toBeUndefined();
  });

  it('uses exact fragments but downgrades shared coarse boundaries', () => {
    const coarse = deriveNavigationUnits({
      positions: [
        {
          href: 'text/chapter.xhtml',
          locations: { position: 1, totalProgression: 0 },
          type: 'application/xhtml+xml',
        },
      ],
      readingOrder: [link('text/chapter.xhtml', 'Chapter')],
      tableOfContents: [link('text/chapter.xhtml#a', 'A'), link('text/chapter.xhtml#b', 'B')],
    });
    const result = calculateReaderProgress(
      event({
        locator: {
          href: 'text/chapter.xhtml',
          locations: { fragments: ['b'], position: 1, progression: 0.5 },
          type: 'application/xhtml+xml',
        },
        overallProgress: 0.5,
        position: 1,
        precision: 'position',
        totalPositions: 1,
      }),
      coarse
    );
    expect(result).toMatchObject({
      chapterProgress: 0,
      navigationUnit: { title: 'B' },
      precision: 'resource',
    });
  });

  it('does not combine stale snapshot identity with a newer event', () => {
    expect(
      calculateReaderProgress(
        event({
          generation: 5,
          locator: position('text/a.xhtml', 1, 0),
          overallProgress: 0,
        }),
        positioned
      )
    ).toBeNull();
  });

  it('returns a detached raw event when no unit can be derived', () => {
    const raw = event({
      locator: { href: 'missing.xhtml', type: 'application/xhtml+xml' },
      overallProgress: 0.2,
      precision: 'resource',
    });
    const enriched = enrichReaderLocationEvent(raw, {
      ...deriveNavigationUnits({ positions: [], readingOrder: [], tableOfContents: [] }),
      generation: raw.generation,
      instanceId: raw.instanceId,
    });
    raw.locator.href = 'mutated.xhtml';
    expect(enriched.locator.href).toBe('missing.xhtml');
    expect(enriched.navigationUnit).toBeUndefined();
  });
});

describe('progress across the scrollable range', () => {
  // Chapter C spans total progression 4/6..1 and the screen shows 0.1 of the book.
  const screen = 0.1;
  const at = (top: number) =>
    calculateReaderProgress(
      event({
        locator: position('text/c.xhtml', 5, top),
        visibleRange: {
          end: position('text/c.xhtml', 6, top + screen),
          start: position('text/c.xhtml', 5, top),
        },
      }),
      positioned
    );

  it('reports 100% for the chapter and book when scrolled to the very bottom', () => {
    const result = at(1 - screen);
    expect(result?.navigationUnit.title).toBe('Chapter C');
    expect(result?.chapterProgress).toBeCloseTo(1, 10);
    expect(result?.overallProgress).toBeCloseTo(1, 10);
  });

  it('reports 0% for the chapter at its very top', () => {
    expect(at(4 / 6)?.chapterProgress).toBeCloseTo(0, 10);
  });

  it('scales linearly between the top and the bottom of the chapter', () => {
    const scrollable = 2 / 6 - screen;
    expect(at(4 / 6 + scrollable / 2)?.chapterProgress).toBeCloseTo(0.5, 10);
    expect(at(4 / 6 + scrollable / 4)?.chapterProgress).toBeCloseTo(0.25, 10);
  });

  it('derives the bottom from resource progression when total progression is absent', () => {
    // Android reports the bottom of the viewport as progression within the resource.
    const result = calculateReaderProgress(
      event({
        locator: {
          href: 'text/c.xhtml',
          locations: { position: 6, progression: 0.7, totalProgression: 4 / 6 + 0.7 / 3 },
          type: 'application/xhtml+xml',
        },
        visibleRange: {
          end: {
            href: 'text/c.xhtml',
            locations: { position: 6, progression: 1 },
            type: 'application/xhtml+xml',
          },
          start: {
            href: 'text/c.xhtml',
            locations: { position: 6, progression: 0.7, totalProgression: 4 / 6 + 0.7 / 3 },
            type: 'application/xhtml+xml',
          },
        },
      }),
      positioned
    );
    expect(result?.chapterProgress).toBeCloseTo(1, 10);
    expect(result?.overallProgress).toBeCloseTo(1, 10);
  });

  it('applies to position-precision events, as Android reports them', () => {
    const result = calculateReaderProgress(
      event({
        locator: position('text/c.xhtml', 6, 1 - screen),
        precision: 'position',
        position: 6,
        totalPositions: 6,
        visibleRange: {
          end: position('text/c.xhtml', 6, 1),
          start: position('text/c.xhtml', 6, 1 - screen),
        },
      }),
      positioned
    );
    expect(result?.chapterProgress).toBeCloseTo(1, 10);
    expect(result?.overallProgress).toBeCloseTo(1, 10);
  });

  it('reports 100% when the whole chapter fits on one screen', () => {
    const result = calculateReaderProgress(
      event({
        locator: position('text/c.xhtml', 5, 4 / 6),
        visibleRange: {
          end: position('text/c.xhtml', 6, 1),
          start: position('text/c.xhtml', 5, 4 / 6),
        },
      }),
      positioned
    );
    expect(result?.chapterProgress).toBeCloseTo(1, 10);
  });
});

describe('current and furthest progress controller utilities', () => {
  const enriched = (
    sequence: number,
    positionValue: number,
    overallProgress: number
  ): ReaderProgressLocationEvent => {
    const calculated = calculateReaderProgress(
      event({
        locator: positionedInput.positions[positionValue - 1]!,
        overallProgress,
        position: positionValue,
        precision: 'position',
        sequence,
        totalPositions: 6,
      }),
      positioned
    );
    if (!calculated) throw new Error('Expected enriched progress.');
    return calculated;
  };

  it('updates current while keeping overall and per-unit furthest values monotonic', () => {
    const first = enriched(1, 2, 1 / 6);
    const later = enriched(2, 4, 0.5);
    const reread = enriched(3, 1, 0);
    let state = createReaderProgressState(first);
    state = updateReaderProgressState(state, later);
    state = updateReaderProgressState(state, reread);

    expect(state.current).toMatchObject({
      navigationUnitId: positioned.units[0]!.id,
      overallProgress: 0,
      position: 1,
    });
    expect(state.furthest).toMatchObject({
      navigationUnitId: positioned.units[1]!.id,
      overallProgress: 0.5,
      position: 4,
    });
    expect(state.units[positioned.units[0]!.id]).toEqual({
      currentProgress: 0,
      furthestProgress: 0.5,
    });
    expect(state.units[positioned.units[1]!.id]).toEqual({
      currentProgress: 0.5,
      furthestProgress: 0.5,
    });
  });

  it('resets ephemeral controller state for a new native generation', () => {
    const first = enriched(1, 4, 0.5);
    const state = createReaderProgressState(first);
    const next = { ...enriched(2, 1, 0), generation: 5 };
    const reset = updateReaderProgressState(state, next);
    expect(Object.keys(reset.units)).toEqual([positioned.units[0]!.id]);
    expect(reset.furthest.overallProgress).toBe(0);
    expect(reset.generation).toBe(5);
  });
});

describe('progress anchor stability', () => {
  const checkpoint = (
    overrides: Partial<ReaderProgressCheckpoint> = {}
  ): ReaderProgressCheckpoint => ({
    chapterProgress: 0.4,
    locator: { href: 'text/a.xhtml', type: 'application/xhtml+xml' },
    navigationUnitId: positioned.units[0]!.id,
    overallProgress: 0.2,
    position: 2,
    precision: 'position',
    ...overrides,
  });

  it('accepts one-position reflow drift but rejects material or cross-unit movement', () => {
    expect(
      readerProgressAnchorsAreMateriallyStable(checkpoint(), checkpoint({ position: 3 }))
    ).toBe(true);
    expect(
      readerProgressAnchorsAreMateriallyStable(checkpoint(), checkpoint({ position: 4 }))
    ).toBe(false);
    expect(
      readerProgressAnchorsAreMateriallyStable(
        checkpoint({ position: undefined }),
        checkpoint({ overallProgress: 0.215, position: undefined })
      )
    ).toBe(true);
    expect(
      readerProgressAnchorsAreMateriallyStable(
        checkpoint(),
        checkpoint({ navigationUnitId: positioned.units[1]!.id })
      )
    ).toBe(false);
  });

  it('validates explicit tolerance policy', () => {
    expect(() =>
      readerProgressAnchorsAreMateriallyStable(checkpoint(), checkpoint(), {
        positionTolerance: -1,
      })
    ).toThrow(RangeError);
    expect(() =>
      readerProgressAnchorsAreMateriallyStable(checkpoint(), checkpoint(), {
        progressionTolerance: Number.NaN,
      })
    ).toThrow(RangeError);
  });
});
