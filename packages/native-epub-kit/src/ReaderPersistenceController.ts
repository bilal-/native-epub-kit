import {
  normalizeReaderPersistenceRecordId,
  normalizeReaderPublicationId,
  parsePersistedReaderPreferences,
  parsePreferenceScope,
  parseReaderAnnotation,
  parseReaderAnnotationList,
  parseReaderBookmark,
  parseReaderBookmarkList,
  parseStoredReadingState,
  sortReaderAnnotations,
  sortReaderBookmarks,
  updateStoredReadingState,
} from './internal/PersistencePolicy.ts';
import {
  ReaderPersistenceError,
  type PreferenceScope,
  type ReaderAnnotation,
  type ReaderBookmark,
  type ReaderPersistenceAdapter,
  type ReaderPersistenceController,
  type ReaderPersistenceControllerOptions,
  type ReaderPersistenceFlushReason,
  type ReaderPersistenceIssue,
  type ReaderPersistenceIssueCode,
  type ReaderPersistenceOperation,
  type ReaderPersistenceSnapshot,
  type ReaderPersistenceStatus,
  type ReaderProcessState,
  type StoredReadingState,
} from './persistence.ts';
import type { ReaderPreferences, ReaderProgressLocationEvent } from './records.ts';

export const DEFAULT_PROGRESS_WRITE_INTERVAL_MS = 5_000;
export const PROGRESS_WRITE_INTERVAL_RANGE_MS = { maximum: 60_000, minimum: 250 } as const;
export const MAXIMUM_PENDING_PERSISTENCE_MUTATIONS = 2_048;

type EntityMutation<T> =
  | { id: number; kind: 'delete'; recordId: string }
  | { id: number; kind: 'save'; recordId: string; value: T };

interface PreferenceMutation {
  id: number;
  value: ReaderPreferences;
}

interface WriteEffects {
  failure?: () => void;
  success?: () => void;
}

function appliedEntityMap<T extends { id: string }>(
  committed: ReadonlyMap<string, T>,
  pending: readonly EntityMutation<T>[]
): Map<string, T> {
  const result = new Map(committed);
  for (const mutation of pending) {
    if (mutation.kind === 'delete') result.delete(mutation.recordId);
    else result.set(mutation.recordId, mutation.value);
  }
  return result;
}

function noop(): void {}

class DefaultReaderPersistenceController implements ReaderPersistenceController {
  readonly #adapter: ReaderPersistenceAdapter;
  readonly #listeners = new Set<(snapshot: ReaderPersistenceSnapshot) => void>();
  readonly #onError: ((error: ReaderPersistenceError) => void) | undefined;
  readonly #preferenceScope: PreferenceScope;
  readonly #progressWriteIntervalMs: number;
  readonly #publicationId: string;

  #activeMutations = new Set<Promise<void>>();
  #committedAnnotations = new Map<string, ReaderAnnotation>();
  #committedBookmarks = new Map<string, ReaderBookmark>();
  #committedPreferences: ReaderPreferences | null = null;
  #destroyPromise: Promise<void> | null = null;
  #destroyRequested = false;
  #issue: ReaderPersistenceIssue | undefined;
  #issueSequence = 0;
  #mutationSequence = 0;
  #pendingAnnotationMutations: EntityMutation<ReaderAnnotation>[] = [];
  #pendingBookmarkMutations: EntityMutation<ReaderBookmark>[] = [];
  #pendingPreferenceMutations: PreferenceMutation[] = [];
  #pendingWrites = 0;
  #persistedProgressRevision = 0;
  #progressRevision = 0;
  #progressSavePromise: Promise<void> | null = null;
  #progressTimer: ReturnType<typeof setTimeout> | null = null;
  #readingState: StoredReadingState | null = null;
  #restorePromise: Promise<ReaderPersistenceSnapshot> | null = null;
  #revision = 0;
  #status: ReaderPersistenceStatus = 'idle';
  #writeTail: Promise<void> = Promise.resolve();

  constructor(options: ReaderPersistenceControllerOptions) {
    this.#adapter = options.adapter;
    this.#publicationId = normalizeReaderPublicationId(options.publicationId);
    this.#preferenceScope = parsePreferenceScope(
      options.preferenceScope ?? { kind: 'publication', publicationId: this.#publicationId }
    );
    if (
      this.#preferenceScope.kind === 'publication' &&
      this.#preferenceScope.publicationId !== this.#publicationId
    ) {
      throw new TypeError('A publication preference scope must match the controller publication.');
    }
    this.#progressWriteIntervalMs =
      options.progressWriteIntervalMs ?? DEFAULT_PROGRESS_WRITE_INTERVAL_MS;
    if (
      !Number.isSafeInteger(this.#progressWriteIntervalMs) ||
      this.#progressWriteIntervalMs < PROGRESS_WRITE_INTERVAL_RANGE_MS.minimum ||
      this.#progressWriteIntervalMs > PROGRESS_WRITE_INTERVAL_RANGE_MS.maximum
    ) {
      throw new RangeError(
        `progressWriteIntervalMs must be a safe integer from ${PROGRESS_WRITE_INTERVAL_RANGE_MS.minimum} through ${PROGRESS_WRITE_INTERVAL_RANGE_MS.maximum}.`
      );
    }
    this.#onError = options.onError;
  }

  clearIssue(): void {
    this.#ensureAlive('load-reading-state');
    if (this.#issue === undefined) return;
    this.#issue = undefined;
    this.#emit();
  }

  async deleteAnnotation(annotationId: string): Promise<void> {
    this.#ensureReady('delete-annotation');
    const recordId = normalizeReaderPersistenceRecordId(annotationId);
    if (!this.#visibleAnnotationMap().has(recordId)) return;
    const mutation: EntityMutation<ReaderAnnotation> = {
      id: ++this.#mutationSequence,
      kind: 'delete',
      recordId,
    };
    this.#ensureMutationCapacity();
    this.#pendingAnnotationMutations.push(mutation);
    return this.#trackMutation(
      this.#enqueueWrite(
        'delete-annotation',
        recordId,
        () => this.#adapter.deleteAnnotation(this.#publicationId, recordId),
        {
          failure: () => this.#removeAnnotationMutation(mutation.id),
          success: () => {
            this.#committedAnnotations.delete(recordId);
            this.#removeAnnotationMutation(mutation.id);
          },
        }
      )
    );
  }

  async deleteBookmark(bookmarkId: string): Promise<void> {
    this.#ensureReady('delete-bookmark');
    const recordId = normalizeReaderPersistenceRecordId(bookmarkId);
    if (!this.#visibleBookmarkMap().has(recordId)) return;
    const mutation: EntityMutation<ReaderBookmark> = {
      id: ++this.#mutationSequence,
      kind: 'delete',
      recordId,
    };
    this.#ensureMutationCapacity();
    this.#pendingBookmarkMutations.push(mutation);
    return this.#trackMutation(
      this.#enqueueWrite(
        'delete-bookmark',
        recordId,
        () => this.#adapter.deleteBookmark(this.#publicationId, recordId),
        {
          failure: () => this.#removeBookmarkMutation(mutation.id),
          success: () => {
            this.#committedBookmarks.delete(recordId);
            this.#removeBookmarkMutation(mutation.id);
          },
        }
      )
    );
  }

  destroy(): Promise<void> {
    if (this.#status === 'destroyed') return Promise.resolve();
    if (this.#destroyPromise) return this.#destroyPromise;
    this.#destroyRequested = true;
    const operation = this.#finishDestruction();
    this.#destroyPromise = operation;
    return operation;
  }

  async #finishDestruction(): Promise<void> {
    this.#cancelProgressTimer();
    if (this.#restorePromise) await Promise.allSettled([this.#restorePromise]);
    let flushError: unknown;
    if (this.#status === 'ready') {
      try {
        await this.#flushProgress();
      } catch (error: unknown) {
        flushError = error;
      }
    }
    await Promise.allSettled([...this.#activeMutations]);
    await this.#writeTail;
    this.#status = 'destroyed';
    this.#emit();
    this.#listeners.clear();
    if (flushError !== undefined) throw flushError;
  }

  async flush(_reason: ReaderPersistenceFlushReason = 'explicit'): Promise<void> {
    this.#ensureReady('save-reading-state');
    await this.#flushProgress();
  }

  getSnapshot(): ReaderPersistenceSnapshot {
    const annotations = sortReaderAnnotations(
      [...this.#visibleAnnotationMap().values()].map((value) => parseReaderAnnotation(value))
    );
    const bookmarks = sortReaderBookmarks(
      [...this.#visibleBookmarkMap().values()].map((value) => parseReaderBookmark(value))
    );
    const preferences = this.#visiblePreferences();
    return {
      annotations,
      bookmarks,
      dirtyReadingState: this.#progressRevision > this.#persistedProgressRevision,
      ...(this.#issue === undefined ? {} : { issue: { ...this.#issue } }),
      pendingWrites: this.#pendingWrites,
      preferences: preferences === null ? null : parsePersistedReaderPreferences(preferences),
      publicationId: this.#publicationId,
      readingState: this.#readingState ? parseStoredReadingState(this.#readingState) : null,
      revision: this.#revision,
      status: this.#status,
    };
  }

  async handleAppStateChange(state: ReaderProcessState): Promise<void> {
    this.#ensureAlive('save-reading-state');
    if (state === 'active' || this.#status !== 'ready') return;
    await this.flush(state === 'background' ? 'background' : 'route-unmount');
  }

  recordProgress(event: ReaderProgressLocationEvent): StoredReadingState {
    this.#ensureReady('save-reading-state');
    this.#readingState = updateStoredReadingState(
      this.#readingState,
      event,
      new Date(Date.now()).toISOString()
    );
    this.#progressRevision += 1;
    this.#scheduleProgressFlush();
    this.#emit();
    return parseStoredReadingState(this.#readingState);
  }

  restore(): Promise<ReaderPersistenceSnapshot> {
    this.#ensureAlive('load-reading-state');
    if (this.#status === 'ready') return Promise.resolve(this.getSnapshot());
    if (this.#restorePromise) return this.#restorePromise;
    this.#status = 'restoring';
    this.#emit();
    const operations = [
      ['load-reading-state', () => this.#adapter.loadReadingState(this.#publicationId)],
      ['list-bookmarks', () => this.#adapter.listBookmarks(this.#publicationId)],
      ['list-annotations', () => this.#adapter.listAnnotations(this.#publicationId)],
      ['load-preferences', () => this.#adapter.loadPreferences(this.#preferenceScope)],
    ] as const;
    const promise = Promise.allSettled(operations.map(([, read]) => read()))
      .then((results) => {
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index]!;
          if (result.status === 'rejected') {
            throw this.#reportIssue(
              'adapter-read-failed',
              operations[index]![0],
              undefined,
              result.reason
            );
          }
        }
        try {
          const readingResult = results[0]!;
          const bookmarkResult = results[1]!;
          const annotationResult = results[2]!;
          const preferenceResult = results[3]!;
          if (
            readingResult.status !== 'fulfilled' ||
            bookmarkResult.status !== 'fulfilled' ||
            annotationResult.status !== 'fulfilled' ||
            preferenceResult.status !== 'fulfilled'
          ) {
            throw new Error('Unreachable persistence restoration state.');
          }
          if (this.#destroyRequested) {
            throw this.#reportIssue('controller-destroyed', 'load-reading-state');
          }
          const readingState = this.#validateRestored('load-reading-state', () =>
            readingResult.value === null ? null : parseStoredReadingState(readingResult.value)
          );
          const bookmarks = this.#validateRestored('list-bookmarks', () =>
            parseReaderBookmarkList(bookmarkResult.value, this.#publicationId, '$/bookmarks')
          );
          const annotations = this.#validateRestored('list-annotations', () =>
            parseReaderAnnotationList(annotationResult.value, this.#publicationId, '$/annotations')
          );
          const preferences = this.#validateRestored('load-preferences', () =>
            preferenceResult.value === null
              ? null
              : parsePersistedReaderPreferences(preferenceResult.value)
          );
          this.#readingState = readingState;
          this.#committedBookmarks = new Map(bookmarks.map((value) => [value.id, value]));
          this.#committedAnnotations = new Map(annotations.map((value) => [value.id, value]));
          this.#committedPreferences = preferences;
          this.#pendingBookmarkMutations = [];
          this.#pendingAnnotationMutations = [];
          this.#pendingPreferenceMutations = [];
          this.#progressRevision = 0;
          this.#persistedProgressRevision = 0;
          this.#issue = undefined;
          this.#status = 'ready';
          this.#emit();
          return this.getSnapshot();
        } catch (error: unknown) {
          if (error instanceof ReaderPersistenceError) throw error;
          throw this.#reportIssue('invalid-persisted-data', 'load-reading-state', undefined, error);
        }
      })
      .catch((error: unknown) => {
        if (this.#destroyRequested) throw error;
        this.#status = 'restore-error';
        this.#emit();
        throw error;
      })
      .finally(() => {
        this.#restorePromise = null;
      });
    this.#restorePromise = promise;
    return promise;
  }

  async saveAnnotation(annotation: ReaderAnnotation): Promise<void> {
    this.#ensureReady('save-annotation');
    const normalized = parseReaderAnnotation(annotation);
    this.#requireMatchingPublication(normalized.publicationId);
    const mutation: EntityMutation<ReaderAnnotation> = {
      id: ++this.#mutationSequence,
      kind: 'save',
      recordId: normalized.id,
      value: normalized,
    };
    this.#ensureMutationCapacity();
    this.#pendingAnnotationMutations.push(mutation);
    return this.#trackMutation(
      this.#enqueueWrite(
        'save-annotation',
        normalized.id,
        () => this.#adapter.saveAnnotation(normalized),
        {
          failure: () => this.#removeAnnotationMutation(mutation.id),
          success: () => {
            this.#committedAnnotations.set(normalized.id, normalized);
            this.#removeAnnotationMutation(mutation.id);
          },
        }
      )
    );
  }

  async saveBookmark(bookmark: ReaderBookmark): Promise<void> {
    this.#ensureReady('save-bookmark');
    const normalized = parseReaderBookmark(bookmark);
    this.#requireMatchingPublication(normalized.publicationId);
    const mutation: EntityMutation<ReaderBookmark> = {
      id: ++this.#mutationSequence,
      kind: 'save',
      recordId: normalized.id,
      value: normalized,
    };
    this.#ensureMutationCapacity();
    this.#pendingBookmarkMutations.push(mutation);
    return this.#trackMutation(
      this.#enqueueWrite(
        'save-bookmark',
        normalized.id,
        () => this.#adapter.saveBookmark(normalized),
        {
          failure: () => this.#removeBookmarkMutation(mutation.id),
          success: () => {
            this.#committedBookmarks.set(normalized.id, normalized);
            this.#removeBookmarkMutation(mutation.id);
          },
        }
      )
    );
  }

  async savePreferences(preferences: ReaderPreferences): Promise<void> {
    this.#ensureReady('save-preferences');
    const normalized = parsePersistedReaderPreferences(preferences);
    const mutation: PreferenceMutation = { id: ++this.#mutationSequence, value: normalized };
    this.#ensureMutationCapacity();
    this.#pendingPreferenceMutations.push(mutation);
    return this.#trackMutation(
      this.#enqueueWrite(
        'save-preferences',
        undefined,
        () => this.#adapter.savePreferences(this.#preferenceScope, normalized),
        {
          failure: () => this.#removePreferenceMutation(mutation.id),
          success: () => {
            this.#committedPreferences = normalized;
            this.#removePreferenceMutation(mutation.id);
          },
        }
      )
    );
  }

  subscribe(listener: (snapshot: ReaderPersistenceSnapshot) => void): () => void {
    this.#ensureAlive('load-reading-state');
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #cancelProgressTimer(): void {
    if (this.#progressTimer === null) return;
    clearTimeout(this.#progressTimer);
    this.#progressTimer = null;
  }

  #emit(): void {
    this.#revision += 1;
    if (this.#listeners.size === 0) return;
    const snapshot = this.getSnapshot();
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch {
        // Consumer subscriptions cannot alter persistence ordering or outcomes.
      }
    }
  }

  #enqueueWrite(
    operation: ReaderPersistenceOperation,
    recordId: string | undefined,
    write: () => Promise<void>,
    effects: WriteEffects = {}
  ): Promise<void> {
    this.#pendingWrites += 1;
    this.#emit();
    const run = async () => {
      try {
        await write();
        effects.success?.();
      } catch (error: unknown) {
        effects.failure?.();
        throw this.#reportIssue('adapter-write-failed', operation, recordId, error);
      }
    };
    const result = this.#writeTail.then(run, run);
    this.#writeTail = result.then(noop, noop);
    return result.finally(() => {
      this.#pendingWrites -= 1;
      this.#emit();
    });
  }

  #ensureAlive(operation: ReaderPersistenceOperation): void {
    if (this.#status !== 'destroyed' && !this.#destroyRequested) return;
    throw this.#reportIssue('controller-destroyed', operation);
  }

  #ensureReady(operation: ReaderPersistenceOperation): void {
    this.#ensureAlive(operation);
    if (this.#status !== 'ready') {
      throw new TypeError(
        `Reader persistence controller is ${this.#status}; call restore() first.`
      );
    }
  }

  #ensureMutationCapacity(): void {
    const count =
      this.#pendingAnnotationMutations.length +
      this.#pendingBookmarkMutations.length +
      this.#pendingPreferenceMutations.length;
    if (count >= MAXIMUM_PENDING_PERSISTENCE_MUTATIONS) {
      throw new RangeError(
        `Reader persistence accepts at most ${MAXIMUM_PENDING_PERSISTENCE_MUTATIONS} queued entity mutations.`
      );
    }
  }

  async #flushProgress(): Promise<void> {
    this.#cancelProgressTimer();
    while (this.#progressRevision > this.#persistedProgressRevision) {
      await this.#persistLatestProgressOnce();
    }
  }

  #persistLatestProgressOnce(): Promise<void> {
    if (this.#progressRevision <= this.#persistedProgressRevision) return Promise.resolve();
    if (this.#progressSavePromise) return this.#progressSavePromise;
    if (this.#readingState === null) return Promise.resolve();
    const revision = this.#progressRevision;
    const state = parseStoredReadingState(this.#readingState);
    const operation = this.#enqueueWrite(
      'save-reading-state',
      undefined,
      () => this.#adapter.saveReadingState(this.#publicationId, state),
      {
        success: () => {
          this.#persistedProgressRevision = Math.max(this.#persistedProgressRevision, revision);
        },
      }
    ).finally(() => {
      if (this.#progressSavePromise === operation) this.#progressSavePromise = null;
    });
    this.#progressSavePromise = operation;
    return operation;
  }

  #removeAnnotationMutation(id: number): void {
    this.#pendingAnnotationMutations = this.#pendingAnnotationMutations.filter(
      (mutation) => mutation.id !== id
    );
  }

  #removeBookmarkMutation(id: number): void {
    this.#pendingBookmarkMutations = this.#pendingBookmarkMutations.filter(
      (mutation) => mutation.id !== id
    );
  }

  #removePreferenceMutation(id: number): void {
    this.#pendingPreferenceMutations = this.#pendingPreferenceMutations.filter(
      (mutation) => mutation.id !== id
    );
  }

  #reportIssue(
    code: ReaderPersistenceIssueCode,
    operation: ReaderPersistenceOperation,
    recordId?: string,
    cause?: unknown
  ): ReaderPersistenceError {
    const issue: ReaderPersistenceIssue = {
      code,
      operation,
      publicationId: this.#publicationId,
      ...(recordId === undefined ? {} : { recordId }),
      recoverable: code !== 'controller-destroyed',
      sequence: ++this.#issueSequence,
    };
    this.#issue = issue;
    const error = new ReaderPersistenceError(issue, cause === undefined ? undefined : { cause });
    try {
      this.#onError?.(error);
    } catch {
      // A consumer error reporter cannot alter controller or adapter outcomes.
    }
    this.#emit();
    return error;
  }

  #requireMatchingPublication(publicationId: string): void {
    if (publicationId === this.#publicationId) return;
    throw new TypeError(
      'Reader persistence record publicationId does not match the controller publication.'
    );
  }

  #validateRestored<T>(operation: ReaderPersistenceOperation, validate: () => T): T {
    try {
      return validate();
    } catch (error: unknown) {
      if (error instanceof ReaderPersistenceError) throw error;
      throw this.#reportIssue('invalid-persisted-data', operation, undefined, error);
    }
  }

  #scheduleProgressFlush(): void {
    if (this.#progressTimer !== null || this.#progressSavePromise !== null) return;
    this.#progressTimer = setTimeout(() => {
      this.#progressTimer = null;
      this.#persistLatestProgressOnce().then(() => {
        if (this.#progressRevision > this.#persistedProgressRevision) {
          this.#scheduleProgressFlush();
        }
      }, noop);
    }, this.#progressWriteIntervalMs);
  }

  #trackMutation(promise: Promise<void>): Promise<void> {
    this.#activeMutations.add(promise);
    promise.finally(() => this.#activeMutations.delete(promise)).catch(noop);
    return promise;
  }

  #visibleAnnotationMap(): Map<string, ReaderAnnotation> {
    return appliedEntityMap(this.#committedAnnotations, this.#pendingAnnotationMutations);
  }

  #visibleBookmarkMap(): Map<string, ReaderBookmark> {
    return appliedEntityMap(this.#committedBookmarks, this.#pendingBookmarkMutations);
  }

  #visiblePreferences(): ReaderPreferences | null {
    return this.#pendingPreferenceMutations.at(-1)?.value ?? this.#committedPreferences;
  }
}

export function createReaderPersistenceController(
  options: ReaderPersistenceControllerOptions
): ReaderPersistenceController {
  return new DefaultReaderPersistenceController(options);
}
