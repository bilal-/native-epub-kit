import { describe, expect, it } from 'vitest';

import {
  STORED_READING_STATE_SCHEMA_VERSION,
  type ReaderAnnotation,
  type ReaderBookmark,
} from '../persistence.ts';
import type { ReaderProgressLocationEvent } from '../records.ts';
import {
  MAXIMUM_PERSISTED_BOOKMARKS,
  parsePreferenceScope,
  parseReaderAnnotation,
  parseReaderAnnotationList,
  parseReaderBookmark,
  parseReaderBookmarkList,
  parseStoredReadingState,
  preferenceScopeKey,
  readerAnnotationToDecoration,
  readerBookmarkToDecoration,
  updateStoredReadingState,
} from './PersistencePolicy.ts';
import { isReaderProgressLocationEvent } from './ReaderProgressPolicy.ts';

const locator = (position = 1) => ({
  href: 'EPUB/text/chapter.xhtml',
  locations: { position, totalProgression: position / 10 },
  text: { highlight: `Paragraph ${position}` },
  type: 'application/xhtml+xml',
});

const bookmark = (overrides: Partial<ReaderBookmark> = {}): ReaderBookmark => ({
  chapterTitle: 'Chapter one',
  createdAt: '2026-07-13T12:00:00.000Z',
  excerpt: 'Paragraph one',
  id: 'bookmark-1',
  locator: locator(),
  navigationUnitId: 'unit-1',
  publicationId: 'book-1',
  updatedAt: '2026-07-13T12:00:00.000Z',
  ...overrides,
});

const annotation = (overrides: Partial<ReaderAnnotation> = {}): ReaderAnnotation => ({
  chapterTitle: 'Chapter one',
  createdAt: '2026-07-13T12:00:00.000Z',
  direction: 'rtl',
  id: 'annotation-1',
  language: 'ur',
  locator: locator(),
  navigationUnitId: 'unit-1',
  note: 'A note',
  publicationId: 'book-1',
  selectedText: 'منتخب عبارت',
  style: { tint: '#E8C97ACC', type: 'highlight' },
  updatedAt: '2026-07-13T12:00:00.000Z',
  ...overrides,
});

const progressEvent = (
  overallProgress: number,
  chapterProgress: number,
  navigationUnitId = 'unit-1'
): ReaderProgressLocationEvent => ({
  chapterProgress,
  generation: 2,
  instanceId: 'reader-2',
  locator: locator(Math.max(1, Math.round(overallProgress * 10))),
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
  position: Math.max(1, Math.round(overallProgress * 10)),
  precision: 'position',
  reason: 'user-scroll',
  sequence: Math.max(1, Math.round(overallProgress * 100)),
});

describe('persistence records', () => {
  it('normalizes and detaches bookmarks and annotations', () => {
    const inputBookmark = bookmark({ id: ' bookmark-1 ' });
    const inputAnnotation = annotation();
    const parsedBookmark = parseReaderBookmark(inputBookmark);
    const parsedAnnotation = parseReaderAnnotation(inputAnnotation);

    expect(parsedBookmark.id).toBe('bookmark-1');
    expect(parsedAnnotation.style).toEqual({
      isActive: false,
      tint: '#e8c97acc',
      type: 'highlight',
    });
    expect(parsedAnnotation.selectedText).toBe('منتخب عبارت');

    inputBookmark.locator.href = 'mutated.xhtml';
    inputAnnotation.locator.href = 'mutated.xhtml';
    expect(parsedBookmark.locator.href).toBe('EPUB/text/chapter.xhtml');
    expect(parsedAnnotation.locator.href).toBe('EPUB/text/chapter.xhtml');
  });

  it('rejects unknown fields, noncanonical timestamps, unsafe styles, and wrong order', () => {
    expect(() => parseReaderBookmark({ ...bookmark(), extra: true })).toThrow(/not supported/);
    expect(() => parseReaderBookmark({ ...bookmark(), createdAt: '2026-07-13T12:00:00Z' })).toThrow(
      /canonical UTC/
    );
    expect(() =>
      parseReaderBookmark({
        ...bookmark(),
        updatedAt: '2026-07-13T11:59:59.000Z',
      })
    ).toThrow(/must not precede/);
    expect(() =>
      parseReaderAnnotation({
        ...annotation(),
        style: { tint: 'url(https://example.com)', type: 'highlight' },
      })
    ).toThrow(/decoration/);
  });

  it('validates and deterministically sorts adapter lists', () => {
    const early = bookmark({ id: 'bookmark-a' });
    const late = bookmark({
      createdAt: '2026-07-13T13:00:00.000Z',
      id: 'bookmark-b',
      updatedAt: '2026-07-13T13:00:00.000Z',
    });
    expect(parseReaderBookmarkList([early, late], 'book-1').map((value) => value.id)).toEqual([
      'bookmark-b',
      'bookmark-a',
    ]);
    expect(() => parseReaderBookmarkList([early, early], 'book-1')).toThrow(/duplicated/);
    expect(() =>
      parseReaderAnnotationList([annotation({ publicationId: 'another-book' })], 'book-1')
    ).toThrow(/does not match/);
    expect(() =>
      parseReaderBookmarkList(Array.from({ length: MAXIMUM_PERSISTED_BOOKMARKS + 1 }), 'book-1')
    ).toThrow(/at most 10000 bookmarks/);
  });

  it('round-trips schema-v1 progress and rejects impossible furthest values', () => {
    const state = parseStoredReadingState({
      current: {
        chapterProgress: 0.25,
        locator: locator(2),
        navigationUnitId: 'unit-1',
        overallProgress: 0.2,
        position: 2,
        precision: 'position',
      },
      furthest: {
        chapterProgress: 0.5,
        locator: locator(4),
        navigationUnitId: 'unit-1',
        overallProgress: 0.4,
        position: 4,
        precision: 'position',
      },
      schemaVersion: STORED_READING_STATE_SCHEMA_VERSION,
      units: { 'unit-1': { currentProgress: 0.25, furthestProgress: 0.5 } },
      updatedAt: '2026-07-13T12:00:00.000Z',
    });
    expect(state.schemaVersion).toBe(1);
    expect(state.furthest.position).toBe(4);
    expect(() =>
      parseStoredReadingState({
        ...state,
        furthest: { ...state.furthest, overallProgress: 0.1 },
      })
    ).toThrow(/must not be less/);
    expect(() => parseStoredReadingState({ ...state, schemaVersion: 2 })).toThrow(/must equal 1/);
  });

  it('keeps current progress reversible and furthest progress monotonic across restarts', () => {
    expect(isReaderProgressLocationEvent(progressEvent(0.7, 0.8))).toBe(true);
    expect(
      isReaderProgressLocationEvent({
        generation: 1,
        instanceId: 'reader',
        locator: locator(),
        precision: 'resource',
        reason: 'initial',
        sequence: 1,
      })
    ).toBe(false);
    const first = updateStoredReadingState(
      null,
      progressEvent(0.7, 0.8),
      '2026-07-13T12:00:00.000Z'
    );
    const reread = updateStoredReadingState(
      first,
      progressEvent(0.2, 0.3),
      '2026-07-13T12:01:00.000Z'
    );
    const nextUnit = updateStoredReadingState(
      reread,
      progressEvent(0.8, 0.1, 'unit-2'),
      '2026-07-13T12:02:00.000Z'
    );

    expect(reread.current.overallProgress).toBe(0.2);
    expect(reread.furthest.overallProgress).toBe(0.7);
    expect(reread.units['unit-1']).toEqual({ currentProgress: 0.3, furthestProgress: 0.8 });
    expect(nextUnit.furthest.overallProgress).toBe(0.8);
    expect(Object.keys(nextUnit.units)).toEqual(['unit-1', 'unit-2']);
  });

  it('uses closed preference scopes and decoration mappings', () => {
    expect(preferenceScopeKey(parsePreferenceScope({ kind: 'global' }))).toBe('global');
    expect(
      preferenceScopeKey(parsePreferenceScope({ kind: 'publication', publicationId: 'book-1' }))
    ).toBe('publication:book-1');
    expect(() => parsePreferenceScope({ kind: 'user', id: '1' })).toThrow(/global or publication/);

    expect(readerAnnotationToDecoration(annotation())).toMatchObject({
      data: { annotationId: 'annotation-1', kind: 'annotation' },
      id: 'annotation-1',
      style: { tint: '#e8c97acc', type: 'highlight' },
    });
    expect(readerBookmarkToDecoration(bookmark())).toMatchObject({
      data: { bookmarkId: 'bookmark-1', kind: 'bookmark' },
      id: 'bookmark-1',
      style: { asset: 'bookmark', type: 'margin-icon' },
    });
  });
});
