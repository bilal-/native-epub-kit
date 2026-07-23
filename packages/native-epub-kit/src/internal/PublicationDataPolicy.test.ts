import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PUBLICATION_POSITION_PAGE_SIZE,
  MAXIMUM_PUBLICATION_POSITION_PAGE_SIZE,
  normalizePublicationPositionRequest,
  publicationDataWarnings,
  publicationPositionPageBounds,
  type PublicationLinkShape,
} from './PublicationDataPolicy';

interface Contract {
  defaultPositionPageSize: number;
  maximumPositionPageSize: number;
  pageCases: {
    expectedCount: number;
    expectedNextOffset: number | null;
    expectedOffset: number;
    limit: number | null;
    name: string;
    offset: number;
    total: number;
  }[];
  tocCases: {
    expectedWarnings: string[];
    fixedLayout: boolean;
    name: string;
    positionCount: number;
    readingOrderHrefs: string[];
    tableOfContents: PublicationLinkShape[];
  }[];
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/publication-data-v1/cases.json', import.meta.url),
    'utf8'
  )
) as Contract;

describe('publication-data-v1 policy', () => {
  it('pins page constants', () => {
    expect(contract.version).toBe(1);
    expect(DEFAULT_PUBLICATION_POSITION_PAGE_SIZE).toBe(contract.defaultPositionPageSize);
    expect(MAXIMUM_PUBLICATION_POSITION_PAGE_SIZE).toBe(contract.maximumPositionPageSize);
  });

  for (const testCase of contract.pageCases) {
    it(`paginates ${testCase.name}`, () => {
      const actual = publicationPositionPageBounds(testCase.total, testCase.offset, testCase.limit);
      expect(actual.offset).toBe(testCase.expectedOffset);
      expect(actual.count).toBe(testCase.expectedCount);
      expect(actual.nextOffset ?? null).toBe(testCase.expectedNextOffset);
    });
  }

  for (const testCase of contract.tocCases) {
    it(`diagnoses ${testCase.name}`, () => {
      expect(
        publicationDataWarnings(
          testCase.tableOfContents,
          testCase.readingOrderHrefs,
          testCase.positionCount,
          testCase.fixedLayout
        )
      ).toEqual(testCase.expectedWarnings);
    });
  }

  it('pages ten thousand positions without copying the full list', () => {
    const positions = Array.from({ length: 10_000 }, (_, index) => index);
    const bounds = publicationPositionPageBounds(positions.length, 9_900, 10_000);
    const page = positions.slice(bounds.offset, bounds.offset + bounds.count);
    expect(page).toHaveLength(100);
    expect(page[0]).toBe(9_900);
    expect(bounds.nextOffset).toBeUndefined();
  });

  it('normalizes the public request before it crosses the Android Int bridge', () => {
    expect(normalizePublicationPositionRequest()).toEqual({ limit: 128, offset: 0 });
    expect(normalizePublicationPositionRequest({ limit: 10_000, offset: 256 })).toEqual({
      limit: 256,
      offset: 256,
    });
    expect(() => normalizePublicationPositionRequest({ offset: -1 })).toThrow(RangeError);
    expect(() => normalizePublicationPositionRequest({ offset: 2_147_483_648 })).toThrow(
      RangeError
    );
    expect(() => normalizePublicationPositionRequest({ limit: 0 })).toThrow(RangeError);
    expect(() => normalizePublicationPositionRequest({ limit: Number.NaN })).toThrow(RangeError);
  });
});
