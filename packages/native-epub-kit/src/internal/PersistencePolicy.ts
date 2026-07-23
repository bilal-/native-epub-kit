import {
  STORED_READING_STATE_SCHEMA_VERSION,
  type PreferenceScope,
  type ReaderAnnotation,
  type ReaderBookmark,
  type StoredReadingState,
} from '../persistence.ts';
import { parseLocator } from '../recordValidation.ts';
import {
  PROGRESS_PRECISIONS,
  type Locator,
  type NavigationUnitProgressState,
  type ReaderDecoration,
  type ReaderPreferences,
  type ReaderProgressCheckpoint,
  type ReaderProgressLocationEvent,
  type TextDirection,
} from '../records.ts';
import { normalizeReaderDecoration } from './DecorationPolicy.ts';
import { normalizeReaderPreferences } from './ReaderPreferencesPolicy.ts';
import { createReaderProgressState } from './ReaderProgressPolicy.ts';

export const MAXIMUM_PUBLICATION_ID_UTF16_UNITS = 256;
export const MAXIMUM_PERSISTENCE_RECORD_ID_UTF16_UNITS = 128;
export const MAXIMUM_NAVIGATION_UNIT_ID_UTF16_UNITS = 512;
export const MAXIMUM_PERSISTED_NAVIGATION_UNITS = 10_000;
export const MAXIMUM_PERSISTED_BOOKMARKS = 10_000;
export const MAXIMUM_PERSISTED_ANNOTATIONS = 10_000;
export const MAXIMUM_BOOKMARK_EXCERPT_UTF16_UNITS = 4_096;
export const MAXIMUM_ANNOTATION_TEXT_UTF16_UNITS = 32_768;
export const MAXIMUM_ANNOTATION_NOTE_UTF16_UNITS = 32_768;
export const MAXIMUM_CHAPTER_TITLE_UTF16_UNITS = 2_048;
export const MAXIMUM_LANGUAGE_TAG_UTF16_UNITS = 128;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const languagePattern = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const progressPrecisions = new Set<string>(PROGRESS_PRECISIONS);

function reject(path: string, message: string): never {
  throw new TypeError(`Invalid reader persistence record at ${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    reject(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) reject(`${path}/${key}`, 'is not supported');
  }
}

function boundedString(
  value: unknown,
  path: string,
  maximum: number,
  options: { allowEmpty?: boolean; normalize?: boolean; trim?: boolean } = {}
): string {
  if (typeof value !== 'string') reject(path, 'must be a string');
  const normalized = options.normalize === false ? value : value.normalize('NFC');
  const result = options.trim === false ? normalized : normalized.trim();
  if (!options.allowEmpty && result.length === 0) reject(path, 'must not be empty');
  if (result.length > maximum) reject(path, `must contain at most ${maximum} UTF-16 units`);
  return result;
}

export function normalizeReaderPublicationId(value: unknown, path = '$/publicationId'): string {
  const id = boundedString(value, path, MAXIMUM_PUBLICATION_ID_UTF16_UNITS);
  if (!identifierPattern.test(id)) {
    reject(
      path,
      'must start with an alphanumeric character and use only A-Z, a-z, 0-9, ., _, :, or -'
    );
  }
  return id;
}

export function normalizeReaderPersistenceRecordId(value: unknown, path = '$/id'): string {
  const id = boundedString(value, path, MAXIMUM_PERSISTENCE_RECORD_ID_UTF16_UNITS);
  if (!identifierPattern.test(id)) {
    reject(
      path,
      'must start with an alphanumeric character and use only A-Z, a-z, 0-9, ., _, :, or -'
    );
  }
  return id;
}

function optionalString(
  value: unknown,
  path: string,
  maximum: number,
  options: { allowEmpty?: boolean; trim?: boolean } = {}
): string | undefined {
  if (value === undefined) return undefined;
  return boundedString(value, path, maximum, options);
}

function timestamp(value: unknown, path: string): string {
  const input = boundedString(value, path, 64);
  const milliseconds = Date.parse(input);
  if (!Number.isFinite(milliseconds)) reject(path, 'must be an RFC 3339 timestamp');
  const canonical = new Date(milliseconds).toISOString();
  if (canonical !== input) reject(path, `must use canonical UTC form ${canonical}`);
  return canonical;
}

function fraction(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    reject(path, 'must be a finite number from 0 through 1');
  }
  return value;
}

function checkpoint(value: unknown, path: string): ReaderProgressCheckpoint {
  const input = object(value, path);
  exactKeys(
    input,
    ['chapterProgress', 'locator', 'navigationUnitId', 'overallProgress', 'position', 'precision'],
    path
  );
  const navigationUnitId = boundedString(
    input.navigationUnitId,
    `${path}/navigationUnitId`,
    MAXIMUM_NAVIGATION_UNIT_ID_UTF16_UNITS
  );
  const precision = boundedString(input.precision, `${path}/precision`, 32);
  if (!progressPrecisions.has(precision)) reject(`${path}/precision`, 'is not supported');
  const position = input.position;
  if (position !== undefined && (!Number.isSafeInteger(position) || (position as number) < 1)) {
    reject(`${path}/position`, 'must be a positive safe integer when present');
  }
  return {
    chapterProgress: fraction(input.chapterProgress, `${path}/chapterProgress`),
    locator: parseLocator(input.locator),
    navigationUnitId,
    overallProgress: fraction(input.overallProgress, `${path}/overallProgress`),
    ...(position === undefined ? {} : { position: position as number }),
    precision: precision as ReaderProgressCheckpoint['precision'],
  };
}

function unitProgress(value: unknown, path: string): NavigationUnitProgressState {
  const input = object(value, path);
  exactKeys(input, ['currentProgress', 'furthestProgress'], path);
  const currentProgress = fraction(input.currentProgress, `${path}/currentProgress`);
  const furthestProgress = fraction(input.furthestProgress, `${path}/furthestProgress`);
  if (furthestProgress < currentProgress) {
    reject(`${path}/furthestProgress`, 'must not be less than currentProgress');
  }
  return { currentProgress, furthestProgress };
}

export function parseStoredReadingState(value: unknown, path = '$'): StoredReadingState {
  const input = object(value, path);
  exactKeys(input, ['current', 'furthest', 'schemaVersion', 'units', 'updatedAt'], path);
  if (input.schemaVersion !== STORED_READING_STATE_SCHEMA_VERSION) {
    reject(`${path}/schemaVersion`, `must equal ${STORED_READING_STATE_SCHEMA_VERSION}`);
  }
  const current = checkpoint(input.current, `${path}/current`);
  const furthest = checkpoint(input.furthest, `${path}/furthest`);
  if (furthest.overallProgress < current.overallProgress) {
    reject(`${path}/furthest/overallProgress`, 'must not be less than current progress');
  }
  const rawUnits = object(input.units, `${path}/units`);
  const entries = Object.entries(rawUnits);
  if (entries.length > MAXIMUM_PERSISTED_NAVIGATION_UNITS) {
    reject(`${path}/units`, `must contain at most ${MAXIMUM_PERSISTED_NAVIGATION_UNITS} entries`);
  }
  const units: Record<string, NavigationUnitProgressState> = {};
  for (const [rawId, value] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    const id = boundedString(rawId, `${path}/units/<key>`, MAXIMUM_NAVIGATION_UNIT_ID_UTF16_UNITS);
    if (Object.hasOwn(units, id)) reject(`${path}/units/${id}`, 'duplicates a normalized unit ID');
    units[id] = unitProgress(value, `${path}/units/${id}`);
  }
  return {
    current,
    furthest,
    schemaVersion: STORED_READING_STATE_SCHEMA_VERSION,
    units,
    updatedAt: timestamp(input.updatedAt, `${path}/updatedAt`),
  };
}

function recordTimes(
  input: Record<string, unknown>,
  path: string
): { createdAt: string; updatedAt: string } {
  const createdAt = timestamp(input.createdAt, `${path}/createdAt`);
  const updatedAt = timestamp(input.updatedAt, `${path}/updatedAt`);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    reject(`${path}/updatedAt`, 'must not precede createdAt');
  }
  return { createdAt, updatedAt };
}

export function parseReaderBookmark(value: unknown, path = '$'): ReaderBookmark {
  const input = object(value, path);
  exactKeys(
    input,
    [
      'chapterTitle',
      'createdAt',
      'excerpt',
      'id',
      'locator',
      'navigationUnitId',
      'publicationId',
      'updatedAt',
    ],
    path
  );
  return {
    ...recordTimes(input, path),
    ...(input.chapterTitle === undefined
      ? {}
      : {
          chapterTitle: boundedString(
            input.chapterTitle,
            `${path}/chapterTitle`,
            MAXIMUM_CHAPTER_TITLE_UTF16_UNITS
          ),
        }),
    ...(input.excerpt === undefined
      ? {}
      : {
          excerpt: boundedString(
            input.excerpt,
            `${path}/excerpt`,
            MAXIMUM_BOOKMARK_EXCERPT_UTF16_UNITS,
            {
              allowEmpty: true,
              trim: false,
            }
          ),
        }),
    id: normalizeReaderPersistenceRecordId(input.id, `${path}/id`),
    locator: parseLocator(input.locator),
    ...(input.navigationUnitId === undefined
      ? {}
      : {
          navigationUnitId: boundedString(
            input.navigationUnitId,
            `${path}/navigationUnitId`,
            MAXIMUM_NAVIGATION_UNIT_ID_UTF16_UNITS
          ),
        }),
    publicationId: normalizeReaderPublicationId(input.publicationId, `${path}/publicationId`),
  };
}

export function parseReaderAnnotation(value: unknown, path = '$'): ReaderAnnotation {
  const input = object(value, path);
  exactKeys(
    input,
    [
      'chapterTitle',
      'createdAt',
      'direction',
      'id',
      'language',
      'locator',
      'navigationUnitId',
      'note',
      'publicationId',
      'selectedText',
      'style',
      'updatedAt',
    ],
    path
  );
  const id = normalizeReaderPersistenceRecordId(input.id, `${path}/id`);
  const locator = parseLocator(input.locator);
  const normalizedDecoration = normalizeReaderDecoration({ id, locator, style: input.style });
  const direction = optionalString(input.direction, `${path}/direction`, 4);
  if (direction !== undefined && !['auto', 'ltr', 'rtl'].includes(direction)) {
    reject(`${path}/direction`, 'must be auto, ltr, or rtl');
  }
  const language = optionalString(
    input.language,
    `${path}/language`,
    MAXIMUM_LANGUAGE_TAG_UTF16_UNITS
  );
  if (language !== undefined && !languagePattern.test(language)) {
    reject(`${path}/language`, 'must be a bounded BCP 47-like language tag');
  }
  return {
    ...recordTimes(input, path),
    ...(input.chapterTitle === undefined
      ? {}
      : {
          chapterTitle: boundedString(
            input.chapterTitle,
            `${path}/chapterTitle`,
            MAXIMUM_CHAPTER_TITLE_UTF16_UNITS
          ),
        }),
    ...(direction === undefined ? {} : { direction: direction as TextDirection }),
    id,
    ...(language === undefined ? {} : { language }),
    locator,
    ...(input.navigationUnitId === undefined
      ? {}
      : {
          navigationUnitId: boundedString(
            input.navigationUnitId,
            `${path}/navigationUnitId`,
            MAXIMUM_NAVIGATION_UNIT_ID_UTF16_UNITS
          ),
        }),
    ...(input.note === undefined
      ? {}
      : {
          note: boundedString(input.note, `${path}/note`, MAXIMUM_ANNOTATION_NOTE_UTF16_UNITS, {
            allowEmpty: true,
            trim: false,
          }),
        }),
    publicationId: normalizeReaderPublicationId(input.publicationId, `${path}/publicationId`),
    selectedText: boundedString(
      input.selectedText,
      `${path}/selectedText`,
      MAXIMUM_ANNOTATION_TEXT_UTF16_UNITS,
      { trim: false }
    ),
    style: normalizedDecoration.style,
  };
}

export function parsePreferenceScope(value: unknown, path = '$'): PreferenceScope {
  const input = object(value, path);
  const kind = boundedString(input.kind, `${path}/kind`, 32);
  if (kind === 'global') {
    exactKeys(input, ['kind'], path);
    return { kind };
  }
  if (kind === 'publication') {
    exactKeys(input, ['kind', 'publicationId'], path);
    return {
      kind,
      publicationId: normalizeReaderPublicationId(input.publicationId, `${path}/publicationId`),
    };
  }
  return reject(`${path}/kind`, 'must be global or publication');
}

export function preferenceScopeKey(scope: PreferenceScope): string {
  const normalized = parsePreferenceScope(scope);
  return normalized.kind === 'global' ? 'global' : `publication:${normalized.publicationId}`;
}

export function parsePersistedReaderPreferences(value: unknown): ReaderPreferences {
  return normalizeReaderPreferences(value as ReaderPreferences);
}

export function sortReaderBookmarks(values: readonly ReaderBookmark[]): ReaderBookmark[] {
  return [...values].sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id)
  );
}

export function sortReaderAnnotations(values: readonly ReaderAnnotation[]): ReaderAnnotation[] {
  return [...values].sort(
    (left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      left.id.localeCompare(right.id)
  );
}

export function parseReaderBookmarkList(
  values: unknown,
  publicationId: string,
  path = '$'
): ReaderBookmark[] {
  if (!Array.isArray(values)) reject(path, 'must be an array');
  if (values.length > MAXIMUM_PERSISTED_BOOKMARKS) {
    reject(path, `must contain at most ${MAXIMUM_PERSISTED_BOOKMARKS} bookmarks`);
  }
  const expectedPublicationId = normalizeReaderPublicationId(publicationId);
  const ids = new Set<string>();
  const result = values.map((value, index) => {
    const bookmark = parseReaderBookmark(value, `${path}/${index}`);
    if (bookmark.publicationId !== expectedPublicationId) {
      reject(`${path}/${index}/publicationId`, 'does not match the controller publication');
    }
    if (ids.has(bookmark.id)) reject(`${path}/${index}/id`, 'is duplicated');
    ids.add(bookmark.id);
    return bookmark;
  });
  return sortReaderBookmarks(result);
}

export function parseReaderAnnotationList(
  values: unknown,
  publicationId: string,
  path = '$'
): ReaderAnnotation[] {
  if (!Array.isArray(values)) reject(path, 'must be an array');
  if (values.length > MAXIMUM_PERSISTED_ANNOTATIONS) {
    reject(path, `must contain at most ${MAXIMUM_PERSISTED_ANNOTATIONS} annotations`);
  }
  const expectedPublicationId = normalizeReaderPublicationId(publicationId);
  const ids = new Set<string>();
  const result = values.map((value, index) => {
    const annotation = parseReaderAnnotation(value, `${path}/${index}`);
    if (annotation.publicationId !== expectedPublicationId) {
      reject(`${path}/${index}/publicationId`, 'does not match the controller publication');
    }
    if (ids.has(annotation.id)) reject(`${path}/${index}/id`, 'is duplicated');
    ids.add(annotation.id);
    return annotation;
  });
  return sortReaderAnnotations(result);
}

function checkpointIsFurther(
  candidate: ReaderProgressCheckpoint,
  current: ReaderProgressCheckpoint
): boolean {
  if (candidate.overallProgress !== current.overallProgress) {
    return candidate.overallProgress > current.overallProgress;
  }
  return (
    candidate.position !== undefined &&
    current.position !== undefined &&
    candidate.position > current.position
  );
}

export function updateStoredReadingState(
  previous: StoredReadingState | null,
  event: ReaderProgressLocationEvent,
  updatedAt: string
): StoredReadingState {
  const eventState = createReaderProgressState(event);
  const current = eventState.current;
  const existingUnit = previous?.units[current.navigationUnitId];
  const units = {
    ...(previous?.units ?? {}),
    [current.navigationUnitId]: {
      currentProgress: current.chapterProgress,
      furthestProgress: Math.max(current.chapterProgress, existingUnit?.furthestProgress ?? 0),
    },
  };
  const furthest =
    previous && !checkpointIsFurther(current, previous.furthest) ? previous.furthest : current;
  return parseStoredReadingState({
    current,
    furthest,
    schemaVersion: STORED_READING_STATE_SCHEMA_VERSION,
    units,
    updatedAt,
  });
}

export function readerAnnotationToDecoration(annotation: ReaderAnnotation): ReaderDecoration {
  const normalized = parseReaderAnnotation(annotation);
  return {
    data: { annotationId: normalized.id, kind: 'annotation' },
    id: normalized.id,
    locator: normalized.locator,
    style: normalized.style,
  };
}

export function readerBookmarkToDecoration(bookmark: ReaderBookmark): ReaderDecoration {
  const normalized = parseReaderBookmark(bookmark);
  return {
    data: { bookmarkId: normalized.id, kind: 'bookmark' },
    id: normalized.id,
    locator: normalized.locator,
    style: { asset: 'bookmark', type: 'margin-icon' },
  };
}

export function cloneLocator(locator: Locator): Locator {
  return parseLocator(locator);
}
