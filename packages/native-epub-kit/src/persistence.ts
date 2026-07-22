import type {
  Locator,
  NavigationUnitProgressState,
  ReaderDecorationStyle,
  ReaderPreferences,
  ReaderProgressCheckpoint,
  ReaderProgressLocationEvent,
  TextDirection,
} from './records.ts';

export const STORED_READING_STATE_SCHEMA_VERSION = 1 as const;

/** Durable progress without native navigator identity or generation state. */
export interface StoredReadingState {
  current: ReaderProgressCheckpoint;
  furthest: ReaderProgressCheckpoint;
  schemaVersion: typeof STORED_READING_STATE_SCHEMA_VERSION;
  units: Record<string, NavigationUnitProgressState>;
  updatedAt: string;
}

export interface ReaderBookmark {
  chapterTitle?: string;
  createdAt: string;
  excerpt?: string;
  id: string;
  locator: Locator;
  navigationUnitId?: string;
  publicationId: string;
  updatedAt: string;
}

export interface ReaderAnnotation {
  chapterTitle?: string;
  createdAt: string;
  direction?: TextDirection;
  id: string;
  language?: string;
  locator: Locator;
  navigationUnitId?: string;
  note?: string;
  publicationId: string;
  selectedText: string;
  style: ReaderDecorationStyle;
  updatedAt: string;
}

export type PreferenceScope = { kind: 'global' } | { kind: 'publication'; publicationId: string };

/**
 * Consumer-owned durable storage. Implementations may use SQLite, cloud state,
 * or another store, but must not expose native Readium objects.
 */
export interface ReaderPersistenceAdapter {
  deleteAnnotation(publicationId: string, annotationId: string): Promise<void>;
  deleteBookmark(publicationId: string, bookmarkId: string): Promise<void>;
  listAnnotations(publicationId: string): Promise<ReaderAnnotation[]>;
  listBookmarks(publicationId: string): Promise<ReaderBookmark[]>;
  loadPreferences(scope: PreferenceScope): Promise<ReaderPreferences | null>;
  loadReadingState(publicationId: string): Promise<StoredReadingState | null>;
  saveAnnotation(annotation: ReaderAnnotation): Promise<void>;
  saveBookmark(bookmark: ReaderBookmark): Promise<void>;
  savePreferences(scope: PreferenceScope, preferences: ReaderPreferences): Promise<void>;
  saveReadingState(publicationId: string, state: StoredReadingState): Promise<void>;
}

export const READER_PERSISTENCE_OPERATIONS = [
  'load-reading-state',
  'save-reading-state',
  'list-bookmarks',
  'save-bookmark',
  'delete-bookmark',
  'list-annotations',
  'save-annotation',
  'delete-annotation',
  'load-preferences',
  'save-preferences',
] as const;
export type ReaderPersistenceOperation = (typeof READER_PERSISTENCE_OPERATIONS)[number];

export const READER_PERSISTENCE_ISSUE_CODES = [
  'adapter-read-failed',
  'adapter-write-failed',
  'invalid-persisted-data',
  'controller-destroyed',
] as const;
export type ReaderPersistenceIssueCode = (typeof READER_PERSISTENCE_ISSUE_CODES)[number];

export interface ReaderPersistenceIssue {
  code: ReaderPersistenceIssueCode;
  operation: ReaderPersistenceOperation;
  publicationId: string;
  recordId?: string;
  recoverable: boolean;
  sequence: number;
}

export class ReaderPersistenceError extends Error {
  readonly code = 'READER_PERSISTENCE_ERROR';

  constructor(
    readonly issue: ReaderPersistenceIssue,
    options?: ErrorOptions
  ) {
    super(`Reader persistence ${issue.operation} failed (${issue.code}).`, options);
    this.name = 'ReaderPersistenceError';
  }
}

export const READER_PERSISTENCE_STATUSES = [
  'idle',
  'restoring',
  'ready',
  'restore-error',
  'destroyed',
] as const;
export type ReaderPersistenceStatus = (typeof READER_PERSISTENCE_STATUSES)[number];

export interface ReaderPersistenceSnapshot {
  annotations: readonly ReaderAnnotation[];
  bookmarks: readonly ReaderBookmark[];
  dirtyReadingState: boolean;
  issue?: ReaderPersistenceIssue;
  pendingWrites: number;
  preferences: ReaderPreferences | null;
  publicationId: string;
  readingState: StoredReadingState | null;
  revision: number;
  status: ReaderPersistenceStatus;
}

export type ReaderPersistenceFlushReason =
  'explicit' | 'background' | 'reader-close' | 'route-unmount' | 'chapter-continuation' | 'destroy';

export type ReaderProcessState = 'active' | 'background' | 'inactive';

export interface ReaderPersistenceControllerOptions {
  adapter: ReaderPersistenceAdapter;
  /** Called with a redaction-safe issue and an Error whose cause remains local. */
  onError?: (error: ReaderPersistenceError) => void;
  preferenceScope?: PreferenceScope;
  /** Trailing throttle interval. Defaults to 5,000 ms. */
  progressWriteIntervalMs?: number;
  publicationId: string;
}

export interface ReaderPersistenceController {
  clearIssue(): void;
  deleteAnnotation(annotationId: string): Promise<void>;
  deleteBookmark(bookmarkId: string): Promise<void>;
  destroy(): Promise<void>;
  flush(reason?: ReaderPersistenceFlushReason): Promise<void>;
  getSnapshot(): ReaderPersistenceSnapshot;
  handleAppStateChange(state: ReaderProcessState): Promise<void>;
  recordProgress(event: ReaderProgressLocationEvent): StoredReadingState;
  restore(): Promise<ReaderPersistenceSnapshot>;
  saveAnnotation(annotation: ReaderAnnotation): Promise<void>;
  saveBookmark(bookmark: ReaderBookmark): Promise<void>;
  savePreferences(preferences: ReaderPreferences): Promise<void>;
  subscribe(listener: (snapshot: ReaderPersistenceSnapshot) => void): () => void;
}

export interface InMemoryReaderPersistenceSeed {
  annotations?: readonly ReaderAnnotation[];
  bookmarks?: readonly ReaderBookmark[];
  preferences?: readonly {
    preferences: ReaderPreferences;
    scope: PreferenceScope;
  }[];
  readingStates?: Readonly<Record<string, StoredReadingState>>;
}
