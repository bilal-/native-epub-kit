import { describe, expect, it } from 'vitest';

import { InMemoryReaderPersistenceAdapter } from './InMemoryReaderPersistenceAdapter.ts';
import type { ReaderAnnotation, ReaderBookmark, StoredReadingState } from './persistence.ts';

const locator = () => ({
  href: 'EPUB/text/chapter.xhtml',
  locations: { position: 1, totalProgression: 0.1 },
  type: 'application/xhtml+xml',
});

const bookmark = (id: string, publicationId = 'book-1', hour = 12): ReaderBookmark => ({
  createdAt: `2026-07-13T${hour}:00:00.000Z`,
  id,
  locator: locator(),
  publicationId,
  updatedAt: `2026-07-13T${hour}:00:00.000Z`,
});

const annotation = (id: string, publicationId = 'book-1', hour = 12): ReaderAnnotation => ({
  createdAt: `2026-07-13T${hour}:00:00.000Z`,
  id,
  locator: locator(),
  publicationId,
  selectedText: `Selected ${id}`,
  style: { tint: '#e8c97a', type: 'highlight' },
  updatedAt: `2026-07-13T${hour}:00:00.000Z`,
});

const readingState: StoredReadingState = {
  current: {
    chapterProgress: 0.1,
    locator: locator(),
    navigationUnitId: 'unit-1',
    overallProgress: 0.1,
    position: 1,
    precision: 'position',
  },
  furthest: {
    chapterProgress: 0.1,
    locator: locator(),
    navigationUnitId: 'unit-1',
    overallProgress: 0.1,
    position: 1,
    precision: 'position',
  },
  schemaVersion: 1,
  units: { 'unit-1': { currentProgress: 0.1, furthestProgress: 0.1 } },
  updatedAt: '2026-07-13T12:00:00.000Z',
};

describe('InMemoryReaderPersistenceAdapter', () => {
  it('seeds, isolates, and deterministically orders publication entities', async () => {
    const adapter = new InMemoryReaderPersistenceAdapter({
      annotations: [annotation('old', 'book-1', 12), annotation('new', 'book-1', 13)],
      bookmarks: [bookmark('old', 'book-1', 12), bookmark('new', 'book-1', 13)],
    });

    await expect(adapter.listBookmarks('book-1')).resolves.toMatchObject([
      { id: 'new' },
      { id: 'old' },
    ]);
    await expect(adapter.listAnnotations('book-1')).resolves.toMatchObject([
      { id: 'new' },
      { id: 'old' },
    ]);
    await expect(adapter.listBookmarks('book-2')).resolves.toEqual([]);
  });

  it('clones records across every read and write boundary', async () => {
    const adapter = new InMemoryReaderPersistenceAdapter();
    const value = bookmark('bookmark-1');
    await adapter.saveBookmark(value);
    value.locator.href = 'mutated-before-read.xhtml';
    const first = await adapter.listBookmarks('book-1');
    first[0]!.locator.href = 'mutated-after-read.xhtml';
    const second = await adapter.listBookmarks('book-1');
    expect(second[0]!.locator.href).toBe('EPUB/text/chapter.xhtml');
  });

  it('supports idempotent CRUD and scoped preferences', async () => {
    const adapter = new InMemoryReaderPersistenceAdapter();
    await adapter.saveBookmark(bookmark('bookmark-1'));
    await adapter.saveAnnotation(annotation('annotation-1'));
    await adapter.savePreferences({ kind: 'global' }, { theme: 'dark' });
    await adapter.savePreferences(
      { kind: 'publication', publicationId: 'book-1' },
      { fontSize: 1.4 }
    );

    await adapter.deleteBookmark('book-1', 'bookmark-1');
    await adapter.deleteBookmark('book-1', 'bookmark-1');
    await adapter.deleteAnnotation('book-1', 'annotation-1');
    expect(await adapter.listBookmarks('book-1')).toEqual([]);
    expect(await adapter.listAnnotations('book-1')).toEqual([]);
    expect(await adapter.loadPreferences({ kind: 'global' })).toMatchObject({ theme: 'dark' });
    expect(
      await adapter.loadPreferences({ kind: 'publication', publicationId: 'book-1' })
    ).toMatchObject({ fontSize: 1.4 });
  });

  it('round-trips detached reading state and rejects duplicate seed IDs', async () => {
    const adapter = new InMemoryReaderPersistenceAdapter();
    await adapter.saveReadingState('book-1', readingState);
    readingState.current.locator.href = 'mutated.xhtml';
    expect((await adapter.loadReadingState('book-1'))?.current.locator.href).toBe(
      'EPUB/text/chapter.xhtml'
    );

    expect(
      () =>
        new InMemoryReaderPersistenceAdapter({
          bookmarks: [bookmark('duplicate'), bookmark('duplicate')],
        })
    ).toThrow(/Duplicate bookmark/);
  });
});
