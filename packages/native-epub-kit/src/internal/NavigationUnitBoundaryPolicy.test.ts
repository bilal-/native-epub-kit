import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type {
  Locator,
  NavigationUnitDerivationInput,
  ProgressPrecision,
  ReaderLocationEvent,
} from '../records.ts';
import {
  MAXIMUM_NAVIGATION_HISTORY_ENTRIES,
  clearReaderNavigationHistory,
  createNativeNavigationUnitBoundaryConfiguration,
  createReaderNavigationHistory,
  matchNavigationUnitBoundary,
  navigationHistoryEntryFromFollowedLink,
  navigationHistoryEntryFromLocation,
  navigationUnitContextForLocation,
  parseNativeNavigationUnitBoundaryEvent,
  popReaderNavigationHistory,
  pushReaderNavigationHistory,
  type NativeNavigationUnitBoundary,
} from './NavigationUnitBoundaryPolicy.ts';
import { deriveNavigationUnits } from './NavigationUnitPolicy.ts';

interface BoundaryContract {
  boundaryCases: {
    expected: { precision: ProgressPrecision; unitId: string };
    location: Locator;
    name: string;
    precision: ProgressPrecision;
    preferredUnitId?: string;
  }[];
  maximumHistoryEntries: number;
  units: NativeNavigationUnitBoundary[];
  version: 1;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/navigation-boundaries-v1/cases.json', import.meta.url),
    'utf8'
  )
) as BoundaryContract;

const position = (href: string, ordinal: number, totalProgression: number): Locator => ({
  href,
  locations: { position: ordinal, totalProgression },
  type: 'application/xhtml+xml',
});

const navigationInput: NavigationUnitDerivationInput = {
  positions: [
    position('text/a.xhtml', 1, 0),
    position('text/a.xhtml', 2, 0.25),
    position('text/b.xhtml', 3, 0.5),
    position('text/b.xhtml', 4, 0.75),
  ],
  readingOrder: [
    { children: [], href: 'text/a.xhtml', title: 'A' },
    { children: [], href: 'text/b.xhtml', title: 'B' },
  ],
  tableOfContents: [
    { children: [], href: 'text/a.xhtml', title: 'Chapter A' },
    { children: [], href: 'text/b.xhtml', title: 'Chapter B' },
  ],
};

const snapshot = {
  ...deriveNavigationUnits(navigationInput),
  generation: 7,
  instanceId: 'boundary-reader',
};

const location = (
  sequence: number,
  ordinal: number,
  totalProgression: number
): ReaderLocationEvent => ({
  generation: snapshot.generation,
  instanceId: snapshot.instanceId,
  locator: navigationInput.positions[ordinal - 1]!,
  overallProgress: totalProgression,
  position: ordinal,
  precision: 'position',
  reason: 'programmatic',
  sequence,
  totalPositions: navigationInput.positions.length,
});

describe('navigation-boundaries-v1 contract', () => {
  it('pins native membership fallbacks and history bounds', () => {
    expect(contract.version).toBe(1);
    expect(MAXIMUM_NAVIGATION_HISTORY_ENTRIES).toBe(contract.maximumHistoryEntries);
    for (const testCase of contract.boundaryCases) {
      const match = matchNavigationUnitBoundary(
        contract.units,
        testCase.location,
        testCase.precision,
        testCase.preferredUnitId
      );
      expect(match?.unit.id, testCase.name).toBe(testCase.expected.unitId);
      expect(match?.precision, testCase.name).toBe(testCase.expected.precision);
    }
  });
});

describe('navigation-unit context', () => {
  it('returns exact previous/current/next state with inclusive starts', () => {
    const first = navigationUnitContextForLocation(location(1, 2, 0.25), snapshot);
    expect(first).toMatchObject({
      atEnd: false,
      atLastPosition: true,
      atStart: false,
      chapterProgress: 0.5,
      index: 0,
      navigationUnit: { title: 'Chapter A' },
      nextNavigationUnit: { title: 'Chapter B' },
    });
    expect(first?.previousNavigationUnit).toBeUndefined();

    const boundary = navigationUnitContextForLocation(location(2, 3, 0.5), snapshot);
    expect(boundary).toMatchObject({
      atEnd: false,
      atLastPosition: false,
      atStart: true,
      chapterProgress: 0,
      index: 1,
      navigationUnit: { title: 'Chapter B' },
      previousNavigationUnit: { title: 'Chapter A' },
    });
    expect(boundary?.nextNavigationUnit).toBeUndefined();

    const finalKnownPosition = navigationUnitContextForLocation(location(4, 4, 0.75), snapshot);
    expect(finalKnownPosition).toMatchObject({
      atEnd: false,
      atLastPosition: true,
      index: 1,
      navigationUnit: { title: 'Chapter B' },
    });
  });

  it('builds a detached generation-coherent native configuration', () => {
    const localSnapshot = {
      ...snapshot,
      units: snapshot.units.map((unit) => ({ ...unit })),
    };
    const configuration = createNativeNavigationUnitBoundaryConfiguration(
      localSnapshot,
      'position'
    );
    localSnapshot.units[0]!.href = 'mutated.xhtml';
    expect(configuration).toMatchObject({
      generation: 7,
      instanceId: 'boundary-reader',
      precision: 'position',
      units: [
        { endPositionExclusive: 3, href: 'text/a.xhtml', startPosition: 1 },
        { endPositionExclusive: 5, href: 'text/b.xhtml', startPosition: 3 },
      ],
    });
  });

  it('downgrades configuration precision when every exact interval is unavailable', () => {
    const withoutContinuous = {
      ...snapshot,
      units: snapshot.units.map((unit, index) =>
        index === 0
          ? { ...unit, endTotalProgression: undefined, startTotalProgression: undefined }
          : { ...unit }
      ),
    };
    expect(
      createNativeNavigationUnitBoundaryConfiguration(withoutContinuous, 'continuous').precision
    ).toBe('position');

    const withoutPositions = {
      ...withoutContinuous,
      units: withoutContinuous.units.map((unit, index) =>
        index === 0
          ? { ...unit, endPositionExclusive: undefined, startPosition: undefined }
          : { ...unit }
      ),
    };
    expect(
      createNativeNavigationUnitBoundaryConfiguration(withoutPositions, 'continuous').precision
    ).toBe('resource');
  });

  it('returns null for stale snapshot identity', () => {
    expect(
      navigationUnitContextForLocation(location(1, 1, 0), {
        ...snapshot,
        generation: snapshot.generation + 1,
      })
    ).toBeNull();
  });

  it('parses a coherent exact boundary event and rejects stale identities', () => {
    const event = parseNativeNavigationUnitBoundaryEvent(
      {
        adjacentNavigationUnitId: snapshot.units[1]!.id,
        boundary: 'end',
        direction: 'forward',
        generation: snapshot.generation,
        instanceId: snapshot.instanceId,
        kind: 'unit',
        locator: location(3, 2, 0.25).locator,
        navigationUnitId: snapshot.units[0]!.id,
        precision: 'position',
        sequence: 9,
      },
      snapshot
    );
    expect(event).toMatchObject({
      adjacentNavigationUnit: { id: snapshot.units[1]!.id },
      boundary: 'end',
      direction: 'forward',
      kind: 'unit',
      navigationUnit: { id: snapshot.units[0]!.id },
      precision: 'position',
      sequence: 9,
    });
    expect(() =>
      parseNativeNavigationUnitBoundaryEvent(
        {
          ...event,
          adjacentNavigationUnitId: snapshot.units[1]!.id,
          generation: snapshot.generation + 1,
          navigationUnitId: snapshot.units[0]!.id,
        },
        snapshot
      )
    ).toThrow(/stale/);
  });
});

describe('bounded reader navigation history', () => {
  it('deduplicates, evicts oldest entries, pops, and clears immutably', () => {
    let state = createReaderNavigationHistory(snapshot, 2);
    state = pushReaderNavigationHistory(
      state,
      navigationHistoryEntryFromLocation(location(1, 1, 0))
    );
    state = pushReaderNavigationHistory(
      state,
      navigationHistoryEntryFromLocation(location(2, 2, 0.25))
    );
    state = pushReaderNavigationHistory(
      state,
      navigationHistoryEntryFromLocation(location(3, 3, 0.5))
    );
    expect(state.entries.map((entry) => entry.locator.locations?.position)).toEqual([2, 3]);
    expect(state.canGoBack).toBe(true);

    const duplicate = pushReaderNavigationHistory(
      state,
      navigationHistoryEntryFromLocation(location(4, 3, 0.5))
    );
    expect(duplicate.entries).toHaveLength(2);

    const popped = popReaderNavigationHistory(duplicate);
    expect(popped.entry?.locator.locations?.position).toBe(3);
    expect(popped.state.entries.map((entry) => entry.locator.locations?.position)).toEqual([2]);
    expect(clearReaderNavigationHistory(popped.state)).toMatchObject({
      canGoBack: false,
      entries: [],
      generation: 7,
      instanceId: 'boundary-reader',
      limit: 2,
    });
    expect(state.entries).toHaveLength(2);
  });

  it('rejects invalid history bounds', () => {
    expect(() => createReaderNavigationHistory(snapshot, 0)).toThrow(TypeError);
    expect(() =>
      createReaderNavigationHistory(snapshot, MAXIMUM_NAVIGATION_HISTORY_ENTRIES + 1)
    ).toThrow(TypeError);
  });

  it('adapts only successfully followed native internal links into exact return entries', () => {
    const sourceLocator = position('text/a.xhtml', 2, 0.25);
    expect(
      navigationHistoryEntryFromFollowedLink({
        disposition: 'followed',
        kind: 'internal',
        sourceLocator,
      })
    ).toEqual({ locator: sourceLocator });
    expect(
      navigationHistoryEntryFromFollowedLink({
        disposition: 'intercepted',
        kind: 'external',
        sourceLocator,
      })
    ).toBeNull();
    expect(
      navigationHistoryEntryFromFollowedLink({
        disposition: 'blocked',
        kind: 'unsupported',
        sourceLocator,
      })
    ).toBeNull();
  });
});
