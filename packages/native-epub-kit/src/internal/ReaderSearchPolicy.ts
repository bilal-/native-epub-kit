import { parseLocator } from '../recordValidation.ts';
import type {
  ReaderSearchExcerpt,
  ReaderSearchOptions,
  ReaderSearchPage,
  ReaderSearchResult,
  ReaderSearchSession,
  ResolvedReaderSearchOptions,
} from '../records.ts';

export const DEFAULT_READER_SEARCH_PAGE_SIZE = 50;
export const MAXIMUM_READER_SEARCH_PAGE_SIZE = 100;
export const MAXIMUM_READER_SEARCH_RESULTS = 2_000;
export const MAXIMUM_READER_SEARCH_QUERY_UTF16_UNITS = 256;
export const MAXIMUM_READER_SEARCH_LANGUAGE_UTF16_UNITS = 64;
export const MAXIMUM_READER_SEARCH_EXCERPT_CONTEXT_UTF16_UNITS = 256;
export const MAXIMUM_READER_SEARCH_EXCERPT_HIGHLIGHT_UTF16_UNITS = 256;
export const MAXIMUM_READER_SEARCH_RESOURCE_TITLE_UTF16_UNITS = 512;
export const MAXIMUM_READER_SEARCH_SESSION_ID_UTF16_UNITS = 128;
export const MAXIMUM_READER_SEARCH_CURSOR_UTF16_UNITS = 128;

export const READER_SEARCH_DECORATION_GROUPS = Object.freeze({
  current: 'search.current:v1',
  results: 'search.results:v1',
} as const);

export const DEFAULT_READER_SEARCH_OPTIONS: Readonly<ResolvedReaderSearchOptions> = Object.freeze({
  caseSensitive: false,
  diacriticSensitive: false,
  pageSize: DEFAULT_READER_SEARCH_PAGE_SIZE,
});

export interface NormalizedReaderSearchRequest {
  options: ResolvedReaderSearchOptions;
  query: string;
}

const languagePattern = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const opaqueIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

function reject(message: string): never {
  throw new TypeError(`Reader search: ${message}`);
}

function inputObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    reject(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function boundedString(
  value: unknown,
  label: string,
  maximumUtf16Units: number,
  allowEmpty = false
): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    reject(`${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}.`);
  }
  if (value.length > maximumUtf16Units) {
    reject(`${label} exceeds ${maximumUtf16Units} UTF-16 units.`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    reject(`${label} must be a safe integer greater than or equal to ${minimum}.`);
  }
  return value as number;
}

function optionalBoolean(value: unknown, label: string, fallback: boolean): boolean {
  const normalized = value ?? fallback;
  if (typeof normalized !== 'boolean') reject(`${label} must be a boolean.`);
  return normalized;
}

export function normalizeReaderSearchRequest(
  query: string,
  options?: ReaderSearchOptions
): NormalizedReaderSearchRequest {
  if (typeof query !== 'string') reject('query must be a string.');
  const normalizedQuery = query.normalize('NFC').trim();
  boundedString(normalizedQuery, 'query', MAXIMUM_READER_SEARCH_QUERY_UTF16_UNITS);

  const input = options === undefined ? {} : inputObject(options, 'options');
  const supported = new Set(['caseSensitive', 'diacriticSensitive', 'language', 'pageSize']);
  for (const key of Object.keys(input)) {
    if (!supported.has(key)) reject(`option ${key} is not supported.`);
  }

  const pageSize = input.pageSize ?? DEFAULT_READER_SEARCH_PAGE_SIZE;
  if (
    !Number.isSafeInteger(pageSize) ||
    (pageSize as number) < 1 ||
    (pageSize as number) > MAXIMUM_READER_SEARCH_PAGE_SIZE
  ) {
    reject(`pageSize must be an integer within 1-${MAXIMUM_READER_SEARCH_PAGE_SIZE}.`);
  }

  let language: string | undefined;
  if (input.language !== undefined) {
    language = boundedString(input.language, 'language', MAXIMUM_READER_SEARCH_LANGUAGE_UTF16_UNITS)
      .normalize('NFC')
      .trim();
    if (!languagePattern.test(language)) reject('language must be a bounded BCP 47 tag.');
  }

  return {
    options: {
      caseSensitive: optionalBoolean(
        input.caseSensitive,
        'caseSensitive',
        DEFAULT_READER_SEARCH_OPTIONS.caseSensitive
      ),
      diacriticSensitive: optionalBoolean(
        input.diacriticSensitive,
        'diacriticSensitive',
        DEFAULT_READER_SEARCH_OPTIONS.diacriticSensitive
      ),
      ...(language === undefined ? {} : { language }),
      pageSize: pageSize as number,
    },
    query: normalizedQuery,
  };
}

export function normalizeReaderSearchSessionId(value: string): string {
  const id = boundedString(value, 'session ID', MAXIMUM_READER_SEARCH_SESSION_ID_UTF16_UNITS);
  if (!opaqueIdentifierPattern.test(id)) reject('session ID is invalid.');
  return id;
}

export function normalizeReaderSearchCursor(value: string | undefined): string {
  if (value === undefined) return '';
  const cursor = boundedString(value, 'cursor', MAXIMUM_READER_SEARCH_CURSOR_UTF16_UNITS);
  if (!opaqueIdentifierPattern.test(cursor)) reject('cursor is invalid.');
  return cursor;
}

function boundedPrefix(
  value: string,
  maximumUtf16Units: number
): { text: string; truncated: boolean } {
  if (value.length <= maximumUtf16Units) return { text: value, truncated: false };
  let text = '';
  for (const scalar of value) {
    if (text.length + scalar.length > maximumUtf16Units) break;
    text += scalar;
  }
  return { text, truncated: true };
}

function boundedSuffix(
  value: string,
  maximumUtf16Units: number
): { text: string; truncated: boolean } {
  if (value.length <= maximumUtf16Units) return { text: value, truncated: false };
  let text = '';
  const scalars = Array.from(value);
  for (let index = scalars.length - 1; index >= 0; index -= 1) {
    const scalar = scalars[index]!;
    if (text.length + scalar.length > maximumUtf16Units) break;
    text = scalar + text;
  }
  return { text, truncated: true };
}

/** Mirrors the native excerpt boundary for deterministic tooling/tests. */
export function normalizeReaderSearchExcerpt(
  before: string,
  highlight: string,
  after: string
): ReaderSearchExcerpt {
  if (typeof before !== 'string' || typeof highlight !== 'string' || typeof after !== 'string') {
    reject('excerpt fields must be strings.');
  }
  const boundedBefore = boundedSuffix(before, MAXIMUM_READER_SEARCH_EXCERPT_CONTEXT_UTF16_UNITS);
  const boundedHighlight = boundedPrefix(
    highlight,
    MAXIMUM_READER_SEARCH_EXCERPT_HIGHLIGHT_UTF16_UNITS
  );
  const boundedAfter = boundedPrefix(after, MAXIMUM_READER_SEARCH_EXCERPT_CONTEXT_UTF16_UNITS);
  return {
    after: boundedAfter.text,
    before: boundedBefore.text,
    highlight: boundedHighlight.text,
    truncated: boundedBefore.truncated || boundedHighlight.truncated || boundedAfter.truncated,
  };
}

function parseSearchOptions(value: unknown): ResolvedReaderSearchOptions {
  const input = inputObject(value, 'native options');
  const normalized = normalizeReaderSearchRequest('search', input as ReaderSearchOptions).options;
  for (const key of Object.keys(input)) {
    if (!(key in normalized)) reject(`native options contain unsupported field ${key}.`);
  }
  return normalized;
}

export function parseReaderSearchSession(value: unknown): ReaderSearchSession {
  const input = inputObject(value, 'native session');
  const id = normalizeReaderSearchSessionId(input.id as string);
  const instanceId = boundedString(input.instanceId, 'instanceId', 256);
  const generation = safeInteger(input.generation, 'generation');
  const nextCursor = normalizeReaderSearchCursor(
    boundedString(input.nextCursor, 'nextCursor', MAXIMUM_READER_SEARCH_CURSOR_UTF16_UNITS)
  );
  const query = boundedString(input.query, 'query', MAXIMUM_READER_SEARCH_QUERY_UTF16_UNITS);
  const options = parseSearchOptions(input.options);
  const groups = inputObject(input.decorationGroups, 'decorationGroups');
  if (
    groups.results !== READER_SEARCH_DECORATION_GROUPS.results ||
    groups.current !== READER_SEARCH_DECORATION_GROUPS.current
  ) {
    reject('native decoration groups do not match the stable search groups.');
  }
  return {
    decorationGroups: READER_SEARCH_DECORATION_GROUPS,
    generation,
    id,
    instanceId,
    nextCursor,
    options,
    query,
  };
}

function parseExcerpt(value: unknown): ReaderSearchExcerpt {
  const input = inputObject(value, 'excerpt');
  const before = boundedString(
    input.before,
    'excerpt.before',
    MAXIMUM_READER_SEARCH_EXCERPT_CONTEXT_UTF16_UNITS,
    true
  );
  const highlight = boundedString(
    input.highlight,
    'excerpt.highlight',
    MAXIMUM_READER_SEARCH_EXCERPT_HIGHLIGHT_UTF16_UNITS,
    true
  );
  const after = boundedString(
    input.after,
    'excerpt.after',
    MAXIMUM_READER_SEARCH_EXCERPT_CONTEXT_UTF16_UNITS,
    true
  );
  if (typeof input.truncated !== 'boolean') reject('excerpt.truncated must be a boolean.');
  return { after, before, highlight, truncated: input.truncated };
}

function parseSearchResult(value: unknown): ReaderSearchResult {
  const input = inputObject(value, 'result');
  const id = boundedString(input.id, 'result.id', 128);
  if (!opaqueIdentifierPattern.test(id)) reject('result.id is invalid.');
  const index = safeInteger(input.index, 'result.index');
  const result: ReaderSearchResult = {
    excerpt: parseExcerpt(input.excerpt),
    id,
    index,
    locator: parseLocator(input.locator),
  };
  if (input.resourceTitle !== undefined) {
    result.resourceTitle = boundedString(
      input.resourceTitle,
      'result.resourceTitle',
      MAXIMUM_READER_SEARCH_RESOURCE_TITLE_UTF16_UNITS
    );
  }
  if (input.navigationUnit !== undefined) {
    const context = inputObject(input.navigationUnit, 'result.navigationUnit');
    const precision = context.precision;
    if (precision !== 'continuous' && precision !== 'position' && precision !== 'resource') {
      reject('result.navigationUnit.precision is invalid.');
    }
    result.navigationUnit = {
      id: boundedString(context.id, 'result.navigationUnit.id', 512),
      index: safeInteger(context.index, 'result.navigationUnit.index'),
      precision,
    };
  }
  return result;
}

export function parseReaderSearchPage(value: unknown): ReaderSearchPage {
  const input = inputObject(value, 'native page');
  const sessionId = normalizeReaderSearchSessionId(input.sessionId as string);
  const cursor = normalizeReaderSearchCursor(
    boundedString(input.cursor, 'cursor', MAXIMUM_READER_SEARCH_CURSOR_UTF16_UNITS)
  );
  const instanceId = boundedString(input.instanceId, 'instanceId', 256);
  const generation = safeInteger(input.generation, 'generation');
  const loadedResultCount = safeInteger(input.loadedResultCount, 'loadedResultCount');
  if (typeof input.complete !== 'boolean' || typeof input.truncated !== 'boolean') {
    reject('complete and truncated must be booleans.');
  }
  if (!Array.isArray(input.results) || input.results.length > MAXIMUM_READER_SEARCH_PAGE_SIZE) {
    reject(`results must contain at most ${MAXIMUM_READER_SEARCH_PAGE_SIZE} entries.`);
  }
  const results = input.results.map(parseSearchResult);
  if (new Set(results.map((result) => result.id)).size !== results.length) {
    reject('result IDs must be unique within a page.');
  }
  for (let index = 1; index < results.length; index += 1) {
    if (results[index - 1]!.index >= results[index]!.index) {
      reject('result indexes must increase within a page.');
    }
  }
  if (results.length > 0 && results.at(-1)!.index >= loadedResultCount) {
    reject('loadedResultCount must include every emitted result.');
  }
  const nextCursor =
    input.nextCursor === undefined
      ? undefined
      : normalizeReaderSearchCursor(input.nextCursor as string);
  if (
    (input.complete && nextCursor !== undefined) ||
    (!input.complete && nextCursor === undefined)
  ) {
    reject('nextCursor presence must be the inverse of complete.');
  }
  return {
    complete: input.complete,
    cursor,
    generation,
    instanceId,
    loadedResultCount,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    results,
    sessionId,
    truncated: input.truncated,
  };
}
