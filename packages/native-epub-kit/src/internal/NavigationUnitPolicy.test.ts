import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseNavigationUnit } from '../recordValidation';
import type {
  ChapterGranularity,
  Locator,
  NavigationUnitDerivationInput,
  PublicationInfo,
  PublicationLink,
  PublicationPositionsPage,
} from '../records';
import {
  MAXIMUM_NAVIGATION_UNIT_DEPTH,
  MAXIMUM_NAVIGATION_UNIT_DIAGNOSTIC_ISSUES,
  deriveNavigationUnits,
  loadNavigationUnitSnapshot,
  normalizeChapterGranularity,
} from './NavigationUnitPolicy';

interface ExpectedCounts {
  aliasCount: number;
  duplicateBoundaryCount: number;
  fallbackUnitCount: number;
  outOfOrderTocEntryCount: number;
  readingOrderResourceCount: number;
  selectedTocEntryCount: number;
  tocEntryCount: number;
  unitCount: number;
  unresolvedTocEntryCount: number;
}

interface ContractCase {
  expected: {
    aliasTitles: string[];
    counts: ExpectedCounts;
    diagnosticCodes: string[];
    endPositionsExclusive: (number | null)[];
    startPositions: (number | null)[];
    unitHrefs: string[];
    unitSources: string[];
    unitTitles: string[];
  };
  granularity: ChapterGranularity;
  input: Omit<NavigationUnitDerivationInput, 'granularity'>;
  name: string;
}

interface Contract {
  cases: ContractCase[];
  version: 1;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/navigation-units-v1/cases.json', import.meta.url),
    'utf8'
  )
) as Contract;

const link = (href: string, title: string, children: PublicationLink[] = []): PublicationLink => ({
  children,
  href,
  title,
});

const position = (href: string, ordinal: number): Locator => ({
  href,
  locations: { position: ordinal, totalProgression: (ordinal - 1) / 4 },
  type: 'application/xhtml+xml',
});

describe('navigation-units-v1 contract', () => {
  it('pins the contract version', () => {
    expect(contract.version).toBe(1);
    expect(contract.cases).toHaveLength(6);
  });

  for (const testCase of contract.cases) {
    it(`derives ${testCase.name}`, () => {
      const result = deriveNavigationUnits({
        ...testCase.input,
        granularity: testCase.granularity,
      });

      expect(result.units.map((unit) => unit.href)).toEqual(testCase.expected.unitHrefs);
      expect(result.units.map((unit) => unit.source)).toEqual(testCase.expected.unitSources);
      expect(result.units.map((unit) => unit.title)).toEqual(testCase.expected.unitTitles);
      expect(result.units.map((unit) => unit.startPosition ?? null)).toEqual(
        testCase.expected.startPositions
      );
      expect(result.units.map((unit) => unit.endPositionExclusive ?? null)).toEqual(
        testCase.expected.endPositionsExclusive
      );
      expect(result.aliases.map((alias) => alias.title)).toEqual(testCase.expected.aliasTitles);
      expect(result.diagnostics.issues.map((issue) => issue.code)).toEqual(
        testCase.expected.diagnosticCodes
      );
      expect(result.diagnostics).toMatchObject(testCase.expected.counts);
      expect(result.diagnostics.issueCount).toBe(result.diagnostics.issues.length);
      expect(result.diagnostics.issuesTruncated).toBe(0);
      result.units.forEach((unit) => expect(parseNavigationUnit(unit)).toEqual(unit));
    });
  }
});

describe('granularity and stable hierarchy', () => {
  const readingOrder = [
    link('text/root.xhtml', 'Root'),
    link('text/child.xhtml', 'Child'),
    link('text/grandchild.xhtml', 'Grandchild'),
    link('text/shallow.xhtml', 'Shallow'),
  ];
  const tableOfContents = [
    link('text/root.xhtml', 'Container', [
      link('text/child.xhtml', 'Nested child', [
        link('text/grandchild.xhtml', 'Nested grandchild'),
      ]),
    ]),
    link('text/shallow.xhtml', 'Shallow branch'),
  ];
  const positions = readingOrder.map((entry, index) => position(entry.href, index + 1));

  const hrefs = (granularity: ChapterGranularity) =>
    deriveNavigationUnits({ granularity, positions, readingOrder, tableOfContents }).units.map(
      (unit) => unit.href
    );

  it('selects top-level, leaf, and requested-depth antichains', () => {
    expect(hrefs('top-level')).toEqual(['text/root.xhtml', 'text/shallow.xhtml']);
    expect(hrefs('leaf')).toEqual([
      'text/root.xhtml',
      'text/child.xhtml',
      'text/grandchild.xhtml',
      'text/shallow.xhtml',
    ]);
    expect(hrefs({ depth: 1 })).toEqual([
      'text/root.xhtml',
      'text/child.xhtml',
      'text/shallow.xhtml',
    ]);
    expect(hrefs({ depth: 2 })).toEqual([
      'text/root.xhtml',
      'text/child.xhtml',
      'text/grandchild.xhtml',
      'text/shallow.xhtml',
    ]);
    expect(hrefs({ depth: 8 })).toEqual([
      'text/root.xhtml',
      'text/child.xhtml',
      'text/grandchild.xhtml',
      'text/shallow.xhtml',
    ]);
  });

  it('retains conceptual TOC hierarchy IDs without requiring selected ancestors', () => {
    const result = deriveNavigationUnits({
      granularity: { depth: 1 },
      positions,
      readingOrder,
      tableOfContents,
    });
    const child = result.units.find((unit) => unit.href === 'text/child.xhtml')!;
    expect(child.id).toMatch(/^toc:0\.0:/);
    expect(child.parentId).toMatch(/^toc:0:/);
    expect(child.childIds).toHaveLength(1);
    expect(child.childIds[0]).toMatch(/^toc:0\.0\.0:/);
  });

  it('keeps IDs stable across titles and detaches every public result', () => {
    const input = { positions, readingOrder, tableOfContents };
    const first = deriveNavigationUnits(input);
    const renamed = structuredClone(input);
    renamed.tableOfContents[0]!.title = 'A translated label';
    const second = deriveNavigationUnits(renamed);

    expect(first.units.map((unit) => unit.id)).toEqual(second.units.map((unit) => unit.id));
    renamed.tableOfContents[0]!.href = 'mutated.xhtml';
    renamed.positions[0]!.href = 'mutated.xhtml';
    expect(second.units[0]!.href).toBe('text/root.xhtml');
    expect(second.units[0]!.startLocator.href).toBe('text/root.xhtml');
  });

  it('resolves a fragment-only nested link against its parent resource', () => {
    const result = deriveNavigationUnits({
      granularity: 'leaf',
      positions: [
        {
          href: 'text/chapter.xhtml',
          locations: { fragments: ['part'], position: 1, totalProgression: 0 },
          type: 'application/xhtml+xml',
        },
      ],
      readingOrder: [link('text/chapter.xhtml', 'Chapter')],
      tableOfContents: [link('text/chapter.xhtml', 'Chapter', [link('#part', 'Nested part')])],
    });
    expect(result.units[0]!.href).toBe('text/chapter.xhtml#part');
    expect(result.units[0]!.startLocator.locations?.fragments).toEqual(['part']);
  });
});

describe('untitled reading-order resources', () => {
  // A publisher omitted footnote pages from the TOC but kept them in the reading order.
  const readingOrder = [
    link('text/cover.xhtml', 'cover'),
    link('text/book.xhtml', 'book'),
    link('text/note-1.xhtml', 'note-1'),
    link('text/note-2.xhtml', 'note-2'),
    link('text/epilogue.xhtml', 'epilogue'),
    link('text/note-3.xhtml', 'note-3'),
  ];
  const tableOfContents = [
    link('text/book.xhtml', 'Book'),
    link('text/epilogue.xhtml', 'Epilogue'),
  ];
  const positions = readingOrder.map((entry, index) => ({
    ...position(entry.href, index + 1),
    locations: { position: index + 1, totalProgression: index / readingOrder.length },
  }));
  const derive = (untitledResources?: 'merge-into-preceding' | 'separate-units') =>
    deriveNavigationUnits({
      granularity: 'top-level',
      positions,
      readingOrder,
      tableOfContents,
      ...(untitledResources === undefined ? {} : { untitledResources }),
    });

  it('keeps each untitled resource as its own unit by default', () => {
    expect(derive().units.map((unit) => unit.href)).toEqual([
      'text/cover.xhtml',
      'text/book.xhtml',
      'text/note-1.xhtml',
      'text/note-2.xhtml',
      'text/epilogue.xhtml',
      'text/note-3.xhtml',
    ]);
    expect(derive('separate-units').units).toEqual(derive().units);
  });

  it('folds untitled resources after the first TOC entry into the preceding unit', () => {
    const result = derive('merge-into-preceding');
    expect(
      result.units.map((unit) => [
        unit.href,
        unit.source,
        unit.startPosition,
        unit.endPositionExclusive,
      ])
    ).toEqual([
      ['text/cover.xhtml', 'reading-order-fallback', 1, 2],
      ['text/book.xhtml', 'toc', 2, 5],
      ['text/epilogue.xhtml', 'toc', 5, 7],
    ]);
    expect(result.diagnostics.fallbackUnitCount).toBe(1);
    expect(result.diagnostics.unitCount).toBe(3);
    result.units.forEach((unit) => expect(parseNavigationUnit(unit)).toEqual(unit));
  });

  it('still falls back by resource when the TOC resolves nothing', () => {
    const result = deriveNavigationUnits({
      granularity: 'top-level',
      positions,
      readingOrder,
      tableOfContents: [link('text/missing.xhtml', 'Missing')],
      untitledResources: 'merge-into-preceding',
    });
    expect(result.units).toHaveLength(readingOrder.length);
    expect(result.units.every((unit) => unit.source === 'reading-order-fallback')).toBe(true);
  });

  it('rejects an unknown untitled-resource policy', () => {
    expect(() =>
      deriveNavigationUnits({
        granularity: 'top-level',
        positions,
        readingOrder,
        tableOfContents,
        untitledResources: 'drop' as 'merge-into-preceding',
      })
    ).toThrow(TypeError);
  });
});

describe('validation, bounds, and coherent paging', () => {
  it('normalizes only supported bounded granularity values', () => {
    expect(normalizeChapterGranularity()).toBe('top-level');
    expect(normalizeChapterGranularity('leaf')).toBe('leaf');
    expect(normalizeChapterGranularity({ depth: MAXIMUM_NAVIGATION_UNIT_DEPTH })).toEqual({
      depth: MAXIMUM_NAVIGATION_UNIT_DEPTH,
    });
    expect(() => normalizeChapterGranularity({ depth: -1 })).toThrow(RangeError);
    expect(() => normalizeChapterGranularity({ depth: 1.5 })).toThrow(RangeError);
    expect(() => normalizeChapterGranularity({ depth: MAXIMUM_NAVIGATION_UNIT_DEPTH + 1 })).toThrow(
      RangeError
    );
    expect(() =>
      normalizeChapterGranularity({ depth: 1, extra: true } as { depth: number })
    ).toThrow(RangeError);
  });

  it('rejects invalid ref granularity before issuing native snapshot commands', async () => {
    let nativeCalled = false;
    await expect(
      loadNavigationUnitSnapshot(
        {
          async getPositions() {
            nativeCalled = true;
            throw new Error('must not run');
          },
          async getPublication() {
            nativeCalled = true;
            throw new Error('must not run');
          },
        },
        { depth: -1 }
      )
    ).rejects.toBeInstanceOf(RangeError);
    expect(nativeCalled).toBe(false);
  });

  it('bounds issue details while retaining exact aggregate counts', () => {
    const missingEntries = Array.from({ length: 600 }, (_, index) =>
      link(`missing/${index}.xhtml`, `Missing ${index}`)
    );
    const result = deriveNavigationUnits({
      positions: [],
      readingOrder: [link('text/only.xhtml', 'Only')],
      tableOfContents: missingEntries,
    });
    expect(result.diagnostics.issueCount).toBe(602);
    expect(result.diagnostics.issues).toHaveLength(MAXIMUM_NAVIGATION_UNIT_DIAGNOSTIC_ISSUES);
    expect(result.diagnostics.issuesTruncated).toBe(90);
    expect(result.diagnostics.unresolvedTocEntryCount).toBe(600);
    expect(result.units).toHaveLength(1);
  });

  it('diagnoses duplicate reading resources and noncanonical position numbers', () => {
    const result = deriveNavigationUnits({
      positions: [position('text/a.xhtml', 4)],
      readingOrder: [link('text/a.xhtml', 'A'), link('./text/a.xhtml', 'Alias resource')],
      tableOfContents: [link('text/a.xhtml', 'A')],
    });
    expect(result.diagnostics.issues.map((issue) => issue.code)).toEqual([
      'reading-order-duplicate-resource',
      'position-number-mismatch',
    ]);
    expect(result.units[0]!.startPosition).toBe(1);
  });

  it('loads every bounded page into one generation-scoped snapshot', async () => {
    const positions = Array.from({ length: 300 }, (_, index) => ({
      href: index < 150 ? 'text/one.xhtml' : 'text/two.xhtml',
      locations: { position: index + 1, totalProgression: index / 300 },
      type: 'application/xhtml+xml',
    }));
    const publication: PublicationInfo = {
      authors: [],
      capabilities: {
        customFonts: true,
        decorations: true,
        footnotes: true,
        progressPrecision: 'position',
        search: true,
        selection: true,
        warnings: [],
      },
      generation: 7,
      instanceId: 'reader-navigation-units',
      languages: ['en'],
      layout: 'reflowable',
      positionCount: positions.length,
      readingOrder: [link('text/one.xhtml', 'One'), link('text/two.xhtml', 'Two')],
      tableOfContents: [link('text/one.xhtml', 'One'), link('text/two.xhtml', 'Two')],
      title: 'Paged fixture',
    };
    const offsets: number[] = [];
    const snapshot = await loadNavigationUnitSnapshot({
      async getPositions(request) {
        const offset = request.offset ?? 0;
        const limit = request.limit ?? 128;
        offsets.push(offset);
        const pagePositions = positions.slice(offset, offset + limit);
        const nextOffset = offset + pagePositions.length;
        return {
          generation: publication.generation,
          instanceId: publication.instanceId,
          ...(nextOffset < positions.length ? { nextOffset } : {}),
          offset,
          positions: pagePositions,
          total: positions.length,
        };
      },
      async getPublication() {
        return publication;
      },
    });
    expect(offsets).toEqual([0, 256]);
    expect(snapshot.instanceId).toBe(publication.instanceId);
    expect(snapshot.generation).toBe(publication.generation);
    expect(snapshot.units.map((unit) => unit.startPosition)).toEqual([1, 151]);
    expect(snapshot.units.map((unit) => unit.endPositionExclusive)).toEqual([151, 301]);
  });

  it('rejects a stale or incoherent position page with a typed error', async () => {
    const publication: PublicationInfo = {
      authors: [],
      capabilities: {
        customFonts: true,
        decorations: true,
        footnotes: true,
        progressPrecision: 'resource',
        search: true,
        selection: true,
        warnings: [],
      },
      generation: 2,
      instanceId: 'reader-current',
      languages: [],
      layout: 'reflowable',
      positionCount: 0,
      readingOrder: [],
      tableOfContents: [],
      title: 'Mismatch',
    };
    const stalePage: PublicationPositionsPage = {
      generation: 1,
      instanceId: 'reader-stale',
      offset: 0,
      positions: [],
      total: 0,
    };
    await expect(
      loadNavigationUnitSnapshot({
        async getPositions() {
          return stalePage;
        },
        async getPublication() {
          return publication;
        },
      })
    ).rejects.toMatchObject({ code: 'NATIVE_INVARIANT_VIOLATION', phase: 'resource' });
  });
});
