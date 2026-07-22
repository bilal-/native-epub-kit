import {
  normalizeReaderPersistenceRecordId,
  normalizeReaderPublicationId,
  parsePersistedReaderPreferences,
  parsePreferenceScope,
  parseReaderAnnotation,
  parseReaderBookmark,
  parseStoredReadingState,
  preferenceScopeKey,
  sortReaderAnnotations,
  sortReaderBookmarks,
} from './internal/PersistencePolicy.ts';
import type {
  InMemoryReaderPersistenceSeed,
  PreferenceScope,
  ReaderAnnotation,
  ReaderBookmark,
  ReaderPersistenceAdapter,
  StoredReadingState,
} from './persistence.ts';
import type { ReaderPreferences } from './records.ts';

function mapFor<T>(store: Map<string, Map<string, T>>, publicationId: string): Map<string, T> {
  const existing = store.get(publicationId);
  if (existing) return existing;
  const created = new Map<string, T>();
  store.set(publicationId, created);
  return created;
}

/** Deterministic reference adapter for examples, tests, and ephemeral readers. */
export class InMemoryReaderPersistenceAdapter implements ReaderPersistenceAdapter {
  readonly #annotations = new Map<string, Map<string, ReaderAnnotation>>();
  readonly #bookmarks = new Map<string, Map<string, ReaderBookmark>>();
  readonly #preferences = new Map<string, ReaderPreferences>();
  readonly #readingStates = new Map<string, StoredReadingState>();

  constructor(seed: InMemoryReaderPersistenceSeed = {}) {
    for (const [rawPublicationId, rawState] of Object.entries(seed.readingStates ?? {})) {
      const publicationId = normalizeReaderPublicationId(rawPublicationId);
      this.#readingStates.set(publicationId, parseStoredReadingState(rawState));
    }
    for (const rawBookmark of seed.bookmarks ?? []) {
      const bookmark = parseReaderBookmark(rawBookmark);
      const records = mapFor(this.#bookmarks, bookmark.publicationId);
      if (records.has(bookmark.id)) throw new TypeError(`Duplicate bookmark ${bookmark.id}.`);
      records.set(bookmark.id, bookmark);
    }
    for (const rawAnnotation of seed.annotations ?? []) {
      const annotation = parseReaderAnnotation(rawAnnotation);
      const records = mapFor(this.#annotations, annotation.publicationId);
      if (records.has(annotation.id)) throw new TypeError(`Duplicate annotation ${annotation.id}.`);
      records.set(annotation.id, annotation);
    }
    for (const entry of seed.preferences ?? []) {
      const scope = parsePreferenceScope(entry.scope);
      this.#preferences.set(
        preferenceScopeKey(scope),
        parsePersistedReaderPreferences(entry.preferences)
      );
    }
  }

  async deleteAnnotation(publicationId: string, annotationId: string): Promise<void> {
    const publication = normalizeReaderPublicationId(publicationId);
    const id = normalizeReaderPersistenceRecordId(annotationId);
    this.#annotations.get(publication)?.delete(id);
  }

  async deleteBookmark(publicationId: string, bookmarkId: string): Promise<void> {
    const publication = normalizeReaderPublicationId(publicationId);
    const id = normalizeReaderPersistenceRecordId(bookmarkId);
    this.#bookmarks.get(publication)?.delete(id);
  }

  async listAnnotations(publicationId: string): Promise<ReaderAnnotation[]> {
    const publication = normalizeReaderPublicationId(publicationId);
    return sortReaderAnnotations(
      [...(this.#annotations.get(publication)?.values() ?? [])].map((value) =>
        parseReaderAnnotation(value)
      )
    );
  }

  async listBookmarks(publicationId: string): Promise<ReaderBookmark[]> {
    const publication = normalizeReaderPublicationId(publicationId);
    return sortReaderBookmarks(
      [...(this.#bookmarks.get(publication)?.values() ?? [])].map((value) =>
        parseReaderBookmark(value)
      )
    );
  }

  async loadPreferences(scope: PreferenceScope): Promise<ReaderPreferences | null> {
    const normalized = parsePreferenceScope(scope);
    const preferences = this.#preferences.get(preferenceScopeKey(normalized));
    return preferences ? parsePersistedReaderPreferences(preferences) : null;
  }

  async loadReadingState(publicationId: string): Promise<StoredReadingState | null> {
    const publication = normalizeReaderPublicationId(publicationId);
    const state = this.#readingStates.get(publication);
    return state ? parseStoredReadingState(state) : null;
  }

  async saveAnnotation(annotation: ReaderAnnotation): Promise<void> {
    const normalized = parseReaderAnnotation(annotation);
    mapFor(this.#annotations, normalized.publicationId).set(normalized.id, normalized);
  }

  async saveBookmark(bookmark: ReaderBookmark): Promise<void> {
    const normalized = parseReaderBookmark(bookmark);
    mapFor(this.#bookmarks, normalized.publicationId).set(normalized.id, normalized);
  }

  async savePreferences(scope: PreferenceScope, preferences: ReaderPreferences): Promise<void> {
    const normalizedScope = parsePreferenceScope(scope);
    this.#preferences.set(
      preferenceScopeKey(normalizedScope),
      parsePersistedReaderPreferences(preferences)
    );
  }

  async saveReadingState(publicationId: string, state: StoredReadingState): Promise<void> {
    const publication = normalizeReaderPublicationId(publicationId);
    this.#readingStates.set(publication, parseStoredReadingState(state));
  }
}
