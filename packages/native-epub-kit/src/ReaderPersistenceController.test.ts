import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryReaderPersistenceAdapter } from './InMemoryReaderPersistenceAdapter.ts';
import {
  createReaderPersistenceController,
  type ReaderPersistenceController,
} from './ReaderPersistenceController.ts';
import {
  ReaderPersistenceError,
  type PreferenceScope,
  type ReaderAnnotation,
  type ReaderBookmark,
  type ReaderPersistenceAdapter,
  type ReaderPersistenceOperation,
  type StoredReadingState,
} from './persistence.ts';
import type { ReaderPreferences, ReaderProgressLocationEvent } from './records.ts';

interface Deferred<T> {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
}

interface WriteGate {
  release: Deferred<void>;
  started: Deferred<void>;
}

function deferred<T>(): Deferred<T> {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    reject = promiseReject;
    resolve = promiseResolve;
  });
  return { promise, reject, resolve };
}

class InstrumentedAdapter implements ReaderPersistenceAdapter {
  activeWrites = 0;
  corruptAnnotations = false;
  readonly delegate: InMemoryReaderPersistenceAdapter;
  maxActiveWrites = 0;
  readonly operations: ReaderPersistenceOperation[] = [];
  readonly #failures = new Map<ReaderPersistenceOperation, number>();
  readonly #gates = new Map<ReaderPersistenceOperation, WriteGate[]>();

  constructor(delegate = new InMemoryReaderPersistenceAdapter()) {
    this.delegate = delegate;
  }

  blockNext(operation: ReaderPersistenceOperation): WriteGate {
    const gate = { release: deferred<void>(), started: deferred<void>() };
    const existing = this.#gates.get(operation) ?? [];
    existing.push(gate);
    this.#gates.set(operation, existing);
    return gate;
  }

  failNext(operation: ReaderPersistenceOperation): void {
    this.#failures.set(operation, (this.#failures.get(operation) ?? 0) + 1);
  }

  async deleteAnnotation(publicationId: string, annotationId: string): Promise<void> {
    return this.#write('delete-annotation', () =>
      this.delegate.deleteAnnotation(publicationId, annotationId)
    );
  }

  async deleteBookmark(publicationId: string, bookmarkId: string): Promise<void> {
    return this.#write('delete-bookmark', () =>
      this.delegate.deleteBookmark(publicationId, bookmarkId)
    );
  }

  async listAnnotations(publicationId: string): Promise<ReaderAnnotation[]> {
    const values = await this.#read('list-annotations', () =>
      this.delegate.listAnnotations(publicationId)
    );
    if (!this.corruptAnnotations) return values;
    return [{ ...values[0], id: 'bad id with spaces' } as ReaderAnnotation];
  }

  async listBookmarks(publicationId: string): Promise<ReaderBookmark[]> {
    return this.#read('list-bookmarks', () => this.delegate.listBookmarks(publicationId));
  }

  async loadPreferences(scope: PreferenceScope): Promise<ReaderPreferences | null> {
    return this.#read('load-preferences', () => this.delegate.loadPreferences(scope));
  }

  async loadReadingState(publicationId: string): Promise<StoredReadingState | null> {
    return this.#read('load-reading-state', () => this.delegate.loadReadingState(publicationId));
  }

  async saveAnnotation(annotation: ReaderAnnotation): Promise<void> {
    return this.#write('save-annotation', () => this.delegate.saveAnnotation(annotation));
  }

  async saveBookmark(bookmark: ReaderBookmark): Promise<void> {
    return this.#write('save-bookmark', () => this.delegate.saveBookmark(bookmark));
  }

  async savePreferences(scope: PreferenceScope, preferences: ReaderPreferences): Promise<void> {
    return this.#write('save-preferences', () => this.delegate.savePreferences(scope, preferences));
  }

  async saveReadingState(publicationId: string, state: StoredReadingState): Promise<void> {
    return this.#write('save-reading-state', () =>
      this.delegate.saveReadingState(publicationId, state)
    );
  }

  #consumeFailure(operation: ReaderPersistenceOperation): void {
    const remaining = this.#failures.get(operation) ?? 0;
    if (remaining === 0) return;
    this.#failures.set(operation, remaining - 1);
    throw new Error(`Injected ${operation} failure`);
  }

  async #read<T>(operation: ReaderPersistenceOperation, read: () => Promise<T>): Promise<T> {
    this.operations.push(operation);
    const gate = this.#gates.get(operation)?.shift();
    if (gate) {
      gate.started.resolve();
      await gate.release.promise;
    }
    this.#consumeFailure(operation);
    return read();
  }

  async #write(operation: ReaderPersistenceOperation, write: () => Promise<void>): Promise<void> {
    this.operations.push(operation);
    this.activeWrites += 1;
    this.maxActiveWrites = Math.max(this.maxActiveWrites, this.activeWrites);
    try {
      const gate = this.#gates.get(operation)?.shift();
      if (gate) {
        gate.started.resolve();
        await gate.release.promise;
      }
      this.#consumeFailure(operation);
      await write();
    } finally {
      this.activeWrites -= 1;
    }
  }
}

const locator = (position = 1) => ({
  href: 'EPUB/text/chapter.xhtml',
  locations: { position, totalProgression: position / 10 },
  text: { highlight: `Paragraph ${position}` },
  type: 'application/xhtml+xml',
});

const bookmark = (
  id = 'bookmark-1',
  hour = 12,
  overrides: Partial<ReaderBookmark> = {}
): ReaderBookmark => ({
  createdAt: `2026-07-13T${hour}:00:00.000Z`,
  excerpt: `Bookmark ${id}`,
  id,
  locator: locator(hour - 11),
  publicationId: 'book-1',
  updatedAt: `2026-07-13T${hour}:00:00.000Z`,
  ...overrides,
});

const annotation = (
  id = 'annotation-1',
  hour = 12,
  overrides: Partial<ReaderAnnotation> = {}
): ReaderAnnotation => ({
  createdAt: `2026-07-13T${hour}:00:00.000Z`,
  id,
  locator: locator(hour - 11),
  publicationId: 'book-1',
  selectedText: `Selected ${id}`,
  style: { tint: '#e8c97a', type: 'highlight' },
  updatedAt: `2026-07-13T${hour}:00:00.000Z`,
  ...overrides,
});

const progress = (
  overallProgress: number,
  chapterProgress = overallProgress,
  navigationUnitId = 'unit-1'
): ReaderProgressLocationEvent => {
  const position = Math.max(1, Math.round(overallProgress * 10));
  return {
    chapterProgress,
    generation: 3,
    instanceId: 'reader-3',
    locator: locator(position),
    navigationUnit: {
      childIds: [],
      depth: 0,
      href: 'EPUB/text/chapter.xhtml',
      id: navigationUnitId,
      source: 'toc',
      startLocator: locator(1),
      title: 'Chapter one',
    },
    overallProgress,
    position,
    precision: 'position',
    reason: 'user-scroll',
    sequence: position,
  };
};

async function restoredController(
  adapter: ReaderPersistenceAdapter,
  onError?: (error: ReaderPersistenceError) => void
): Promise<ReaderPersistenceController> {
  const controller = createReaderPersistenceController({
    adapter,
    onError,
    progressWriteIntervalMs: 1_000,
    publicationId: 'book-1',
  });
  await controller.restore();
  return controller;
}

describe('ReaderPersistenceController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T16:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores all domains atomically in deterministic order', async () => {
    const adapter = new InstrumentedAdapter(
      new InMemoryReaderPersistenceAdapter({
        annotations: [annotation('older', 12), annotation('newer', 13)],
        bookmarks: [bookmark('older', 12), bookmark('newer', 13)],
        preferences: [
          {
            preferences: { fontSize: 1.4, theme: 'dark' },
            scope: { kind: 'publication', publicationId: 'book-1' },
          },
        ],
      })
    );
    const controller = createReaderPersistenceController({
      adapter,
      publicationId: 'book-1',
    });
    const statuses: string[] = [];
    controller.subscribe((snapshot) => statuses.push(snapshot.status));

    const snapshot = await controller.restore();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.bookmarks.map((value) => value.id)).toEqual(['newer', 'older']);
    expect(snapshot.annotations.map((value) => value.id)).toEqual(['newer', 'older']);
    expect(snapshot.preferences).toMatchObject({ fontSize: 1.4, theme: 'dark' });
    expect(statuses).toEqual(['restoring', 'ready']);
    expect(adapter.operations.slice(0, 4)).toEqual([
      'load-reading-state',
      'list-bookmarks',
      'list-annotations',
      'load-preferences',
    ]);
  });

  it('reports deterministic read and validation failures and permits retry', async () => {
    const errors: ReaderPersistenceError[] = [];
    const adapter = new InstrumentedAdapter();
    adapter.failNext('list-bookmarks');
    const controller = createReaderPersistenceController({
      adapter,
      onError: (error) => errors.push(error),
      publicationId: 'book-1',
    });

    await expect(controller.restore()).rejects.toMatchObject({
      issue: { code: 'adapter-read-failed', operation: 'list-bookmarks' },
    });
    expect(controller.getSnapshot().status).toBe('restore-error');
    await expect(controller.restore()).resolves.toMatchObject({ status: 'ready' });

    const corruptAdapter = new InstrumentedAdapter();
    corruptAdapter.corruptAnnotations = true;
    const corrupt = createReaderPersistenceController({
      adapter: corruptAdapter,
      onError: (error) => errors.push(error),
      publicationId: 'book-1',
    });
    await expect(corrupt.restore()).rejects.toMatchObject({
      issue: { code: 'invalid-persisted-data', operation: 'list-annotations' },
    });
    expect(errors).toHaveLength(2);
  });

  it('trailing-throttles progress and flushes immediately for lifecycle boundaries', async () => {
    const adapter = new InstrumentedAdapter();
    const controller = await restoredController(adapter);
    adapter.operations.length = 0;

    controller.recordProgress(progress(0.1));
    controller.recordProgress(progress(0.2));
    controller.recordProgress(progress(0.3));
    expect(adapter.operations).toEqual([]);
    expect(controller.getSnapshot()).toMatchObject({
      dirtyReadingState: true,
      readingState: { current: { overallProgress: 0.3 } },
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(adapter.operations).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter.operations).toEqual(['save-reading-state']);
    expect((await adapter.delegate.loadReadingState('book-1'))?.current.overallProgress).toBe(0.3);

    controller.recordProgress(progress(0.4));
    await controller.handleAppStateChange('active');
    expect(adapter.operations).toHaveLength(1);
    await controller.handleAppStateChange('background');
    expect(adapter.operations).toHaveLength(2);

    controller.recordProgress(progress(0.5));
    await controller.flush('reader-close');
    controller.recordProgress(progress(0.6));
    await controller.flush('route-unmount');
    controller.recordProgress(progress(0.7));
    await controller.flush('chapter-continuation');
    expect(adapter.operations.filter((value) => value === 'save-reading-state')).toHaveLength(5);
  });

  it('drains progress that arrives during an in-flight lifecycle flush', async () => {
    const adapter = new InstrumentedAdapter();
    const controller = await restoredController(adapter);
    adapter.operations.length = 0;
    const gate = adapter.blockNext('save-reading-state');

    controller.recordProgress(progress(0.2));
    const flushing = controller.flush('background');
    await gate.started.promise;
    controller.recordProgress(progress(0.4));
    gate.release.resolve();
    await flushing;

    expect(adapter.operations).toEqual(['save-reading-state', 'save-reading-state']);
    expect((await adapter.delegate.loadReadingState('book-1'))?.current.overallProgress).toBe(0.4);
    expect(controller.getSnapshot().dirtyReadingState).toBe(false);
  });

  it('serializes every write while exposing optimistic entity state', async () => {
    const adapter = new InstrumentedAdapter();
    const controller = await restoredController(adapter);
    adapter.operations.length = 0;
    const gate = adapter.blockNext('save-bookmark');
    controller.subscribe(() => {
      throw new Error('Consumer listener failure');
    });

    const bookmarkWrite = controller.saveBookmark(bookmark());
    expect(controller.getSnapshot()).toMatchObject({
      bookmarks: [{ id: 'bookmark-1' }],
      pendingWrites: 1,
    });
    const annotationWrite = controller.saveAnnotation(annotation());
    controller.recordProgress(progress(0.3));
    const progressWrite = controller.flush('explicit');
    await gate.started.promise;
    expect(adapter.maxActiveWrites).toBe(1);
    gate.release.resolve();
    await Promise.all([bookmarkWrite, annotationWrite, progressWrite]);

    expect(adapter.operations).toEqual(['save-bookmark', 'save-annotation', 'save-reading-state']);
    expect(adapter.maxActiveWrites).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({ pendingWrites: 0 });
  });

  it('rolls back only a failed optimistic mutation and preserves later intent', async () => {
    const errors: ReaderPersistenceError[] = [];
    const adapter = new InstrumentedAdapter(
      new InMemoryReaderPersistenceAdapter({ bookmarks: [bookmark('bookmark-1')] })
    );
    const controller = await restoredController(adapter, (error) => errors.push(error));
    adapter.failNext('save-bookmark');

    const failed = controller.saveBookmark(
      bookmark('bookmark-1', 13, { excerpt: 'First optimistic edit' })
    );
    const succeeding = controller.saveBookmark(
      bookmark('bookmark-1', 14, { excerpt: 'Later queued edit' })
    );
    expect(controller.getSnapshot().bookmarks[0]?.excerpt).toBe('Later queued edit');

    await expect(failed).rejects.toMatchObject({
      issue: { code: 'adapter-write-failed', operation: 'save-bookmark' },
    });
    expect(controller.getSnapshot().bookmarks[0]?.excerpt).toBe('Later queued edit');
    await succeeding;
    expect((await adapter.delegate.listBookmarks('book-1'))[0]?.excerpt).toBe('Later queued edit');
    expect(errors).toHaveLength(1);
  });

  it('restores failed optimistic deletes and preference updates', async () => {
    const adapter = new InstrumentedAdapter(
      new InMemoryReaderPersistenceAdapter({
        annotations: [annotation()],
        preferences: [
          {
            preferences: { theme: 'light' },
            scope: { kind: 'publication', publicationId: 'book-1' },
          },
        ],
      })
    );
    const controller = await restoredController(adapter);

    adapter.failNext('delete-annotation');
    const deletion = controller.deleteAnnotation('annotation-1');
    expect(controller.getSnapshot().annotations).toEqual([]);
    await expect(deletion).rejects.toBeInstanceOf(ReaderPersistenceError);
    expect(controller.getSnapshot().annotations).toMatchObject([{ id: 'annotation-1' }]);

    adapter.failNext('save-preferences');
    const preferenceWrite = controller.savePreferences({ theme: 'dark' });
    expect(controller.getSnapshot().preferences).toMatchObject({ theme: 'dark' });
    await expect(preferenceWrite).rejects.toBeInstanceOf(ReaderPersistenceError);
    expect(controller.getSnapshot().preferences).toMatchObject({ theme: 'light' });
  });

  it('keeps dirty progress after a write failure and retries the latest state', async () => {
    const errors: ReaderPersistenceError[] = [];
    const adapter = new InstrumentedAdapter();
    const controller = await restoredController(adapter, (error) => errors.push(error));
    adapter.failNext('save-reading-state');
    controller.recordProgress(progress(0.5));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(controller.getSnapshot()).toMatchObject({
      dirtyReadingState: true,
      issue: { operation: 'save-reading-state' },
    });
    await controller.flush('explicit');
    expect(controller.getSnapshot().dirtyReadingState).toBe(false);
    expect((await adapter.delegate.loadReadingState('book-1'))?.current.overallProgress).toBe(0.5);
    expect(errors).toHaveLength(1);
  });

  it('restores exact durable state in a new controller after process destruction', async () => {
    const adapter = new InstrumentedAdapter();
    const first = await restoredController(adapter);
    first.recordProgress(progress(0.7, 0.8));
    first.recordProgress(progress(0.2, 0.3));
    await first.saveBookmark(bookmark());
    await first.saveAnnotation(annotation());
    await first.savePreferences({ fontSize: 1.6, theme: 'sepia' });
    await first.destroy();

    const second = await restoredController(adapter);
    expect(second.getSnapshot()).toMatchObject({
      annotations: [{ id: 'annotation-1' }],
      bookmarks: [{ id: 'bookmark-1' }],
      dirtyReadingState: false,
      preferences: { fontSize: 1.6, theme: 'sepia' },
      readingState: {
        current: { overallProgress: 0.2 },
        furthest: { overallProgress: 0.7 },
        units: { 'unit-1': { currentProgress: 0.3, furthestProgress: 0.8 } },
      },
      status: 'ready',
    });
  });

  it('flushes before destruction and rejects every later mutation', async () => {
    const adapter = new InstrumentedAdapter();
    const controller = await restoredController(adapter);
    const statuses: string[] = [];
    controller.subscribe((snapshot) => statuses.push(snapshot.status));
    controller.recordProgress(progress(0.6));
    await controller.destroy();

    expect(controller.getSnapshot()).toMatchObject({
      dirtyReadingState: false,
      status: 'destroyed',
    });
    expect(statuses.at(-1)).toBe('destroyed');
    await expect(controller.saveBookmark(bookmark())).rejects.toMatchObject({
      issue: { code: 'controller-destroyed' },
    });
    expect(() => controller.recordProgress(progress(0.7))).toThrow(ReaderPersistenceError);
    expect(() => controller.subscribe(() => undefined)).toThrow(ReaderPersistenceError);
    await expect(controller.destroy()).resolves.toBeUndefined();
  });

  it('cancels an in-flight atomic restore without a late ready snapshot', async () => {
    const adapter = new InstrumentedAdapter();
    const gate = adapter.blockNext('load-reading-state');
    const controller = createReaderPersistenceController({
      adapter,
      publicationId: 'book-1',
    });
    const statuses: string[] = [];
    controller.subscribe((snapshot) => statuses.push(snapshot.status));

    const restoring = controller.restore();
    await gate.started.promise;
    const firstDestroy = controller.destroy();
    const secondDestroy = controller.destroy();
    gate.release.resolve();

    await expect(restoring).rejects.toMatchObject({
      issue: { code: 'controller-destroyed', operation: 'load-reading-state' },
    });
    await Promise.all([firstDestroy, secondDestroy]);
    expect(statuses).not.toContain('ready');
    expect(controller.getSnapshot().status).toBe('destroyed');
  });
});
