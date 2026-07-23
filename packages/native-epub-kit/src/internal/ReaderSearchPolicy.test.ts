import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { ReaderSearchOptions } from '../records.ts';
import {
  DEFAULT_READER_SEARCH_OPTIONS,
  DEFAULT_READER_SEARCH_PAGE_SIZE,
  MAXIMUM_READER_SEARCH_CURSOR_UTF16_UNITS,
  MAXIMUM_READER_SEARCH_EXCERPT_CONTEXT_UTF16_UNITS,
  MAXIMUM_READER_SEARCH_EXCERPT_HIGHLIGHT_UTF16_UNITS,
  MAXIMUM_READER_SEARCH_LANGUAGE_UTF16_UNITS,
  MAXIMUM_READER_SEARCH_PAGE_SIZE,
  MAXIMUM_READER_SEARCH_QUERY_UTF16_UNITS,
  MAXIMUM_READER_SEARCH_RESOURCE_TITLE_UTF16_UNITS,
  MAXIMUM_READER_SEARCH_RESULTS,
  MAXIMUM_READER_SEARCH_SESSION_ID_UTF16_UNITS,
  READER_SEARCH_DECORATION_GROUPS,
  normalizeReaderSearchExcerpt,
  normalizeReaderSearchRequest,
  parseReaderSearchPage,
  parseReaderSearchSession,
} from './ReaderSearchPolicy.ts';

interface RepeatValue {
  count: number;
  value: string;
}

interface RequestCase {
  expected?: unknown;
  expectedError?: boolean;
  name: string;
  options: ReaderSearchOptions | null;
  query?: string;
  queryRepeat?: RepeatValue;
}

interface ExcerptCase {
  after?: string;
  afterRepeat?: RepeatValue;
  before?: string;
  beforeRepeat?: RepeatValue;
  expected?: unknown;
  expectedLengths?: { after: number; before: number; highlight: number };
  expectedTruncated?: boolean;
  highlight: string;
  name: string;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/search-policy-v1/cases.json', import.meta.url),
    'utf8'
  )
) as {
  bounds: Record<string, number>;
  decorationGroups: { current: string; results: string };
  defaults: ReaderSearchOptions;
  excerptCases: ExcerptCase[];
  requestCases: RequestCase[];
  version: number;
};

const expanded = (value: string | undefined, repeat: RepeatValue | undefined): string =>
  repeat ? repeat.value.repeat(repeat.count) : (value ?? '');

describe('search-policy-v1 contract', () => {
  it('pins shared bounds, defaults, and isolated decoration groups', () => {
    expect(contract.version).toBe(1);
    expect(contract.bounds).toEqual({
      defaultPageSize: DEFAULT_READER_SEARCH_PAGE_SIZE,
      maximumCursorUtf16Units: MAXIMUM_READER_SEARCH_CURSOR_UTF16_UNITS,
      maximumExcerptContextUtf16Units: MAXIMUM_READER_SEARCH_EXCERPT_CONTEXT_UTF16_UNITS,
      maximumExcerptHighlightUtf16Units: MAXIMUM_READER_SEARCH_EXCERPT_HIGHLIGHT_UTF16_UNITS,
      maximumLanguageUtf16Units: MAXIMUM_READER_SEARCH_LANGUAGE_UTF16_UNITS,
      maximumPageSize: MAXIMUM_READER_SEARCH_PAGE_SIZE,
      maximumQueryUtf16Units: MAXIMUM_READER_SEARCH_QUERY_UTF16_UNITS,
      maximumResourceTitleUtf16Units: MAXIMUM_READER_SEARCH_RESOURCE_TITLE_UTF16_UNITS,
      maximumResults: MAXIMUM_READER_SEARCH_RESULTS,
      maximumSessionIdUtf16Units: MAXIMUM_READER_SEARCH_SESSION_ID_UTF16_UNITS,
    });
    expect(DEFAULT_READER_SEARCH_OPTIONS).toEqual(contract.defaults);
    expect(READER_SEARCH_DECORATION_GROUPS).toEqual(contract.decorationGroups);
  });

  for (const testCase of contract.requestCases) {
    it(`normalizes request ${testCase.name}`, () => {
      const query = expanded(testCase.query, testCase.queryRepeat);
      const action = () => normalizeReaderSearchRequest(query, testCase.options ?? undefined);
      if (testCase.expectedError) {
        expect(action).toThrow(TypeError);
      } else {
        expect(action()).toEqual(testCase.expected);
      }
    });
  }

  for (const testCase of contract.excerptCases) {
    it(`normalizes excerpt ${testCase.name}`, () => {
      const excerpt = normalizeReaderSearchExcerpt(
        expanded(testCase.before, testCase.beforeRepeat),
        testCase.highlight,
        expanded(testCase.after, testCase.afterRepeat)
      );
      if (testCase.expected) expect(excerpt).toEqual(testCase.expected);
      if (testCase.expectedLengths) {
        expect({
          after: excerpt.after.length,
          before: excerpt.before.length,
          highlight: excerpt.highlight.length,
        }).toEqual(testCase.expectedLengths);
      }
      if (testCase.expectedTruncated !== undefined) {
        expect(excerpt.truncated).toBe(testCase.expectedTruncated);
      }
    });
  }
});

describe('native search result validation', () => {
  const session = {
    decorationGroups: READER_SEARCH_DECORATION_GROUPS,
    generation: 3,
    id: 'session-3',
    instanceId: 'reader-a',
    nextCursor: '0',
    options: { caseSensitive: false, diacriticSensitive: false, pageSize: 50 },
    query: 'reader',
  };

  it('parses a bounded session and page with navigation context', () => {
    expect(parseReaderSearchSession(session)).toEqual(session);
    const page = {
      complete: true,
      cursor: '0',
      generation: 3,
      instanceId: 'reader-a',
      loadedResultCount: 1,
      results: [
        {
          excerpt: { after: ' after', before: 'before ', highlight: 'reader', truncated: false },
          id: 'search-result:0',
          index: 0,
          locator: {
            href: 'EPUB/text/chapter.xhtml',
            locations: { progression: 0.25 },
            text: { after: ' after', before: 'before ', highlight: 'reader' },
            type: 'application/xhtml+xml',
          },
          navigationUnit: { id: 'chapter-1', index: 0, precision: 'position' },
          resourceTitle: 'First chapter',
        },
      ],
      sessionId: 'session-3',
      truncated: false,
    };
    expect(parseReaderSearchPage(page)).toEqual(page);
  });

  it('rejects cursor/identity and bridge-bound violations', () => {
    expect(() => parseReaderSearchSession({ ...session, nextCursor: '' })).toThrow(TypeError);
    expect(() =>
      parseReaderSearchPage({
        complete: false,
        cursor: '0',
        generation: 3,
        instanceId: 'reader-a',
        loadedResultCount: 0,
        results: [],
        sessionId: 'session-3',
        truncated: false,
      })
    ).toThrow(TypeError);
  });
});
