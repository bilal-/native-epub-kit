// React Native uses `index.ts` through the package's `react-native` condition,
// retaining Metro's platform-file selection. The default Node condition is a
// loadable tooling/SSR boundary that fails only if a native view is rendered;
// importing Expo's native entry point directly is not supported in Node.
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type {
  EpubReaderViewProps,
  EpubReaderViewRef,
  EpubReaderQualificationOptions,
  FootnoteClassifier,
  FootnoteClassifierDecision,
  NavigationActionEvent,
  ProgressReason,
  ProgressViewport,
  ProgressViewportResource,
  ReaderLifecycleState,
  ReaderErrorEvent,
  ReaderEventIdentity,
  ReaderReadyEvent,
  ReaderStateChangeEvent,
  ReaderProgressEvent,
  ReaderState,
  TypographyDiagnostics,
} from './EpubReaderView.types.js';

export { InMemoryReaderPersistenceAdapter } from './InMemoryReaderPersistenceAdapter.js';
export {
  DEFAULT_PROGRESS_WRITE_INTERVAL_MS,
  MAXIMUM_PENDING_PERSISTENCE_MUTATIONS,
  PROGRESS_WRITE_INTERVAL_RANGE_MS,
  createReaderPersistenceController,
} from './ReaderPersistenceController.js';

export {
  NativeEpubKitError,
  RecordValidationError,
  parseCoreRecord,
  parseFootnoteEvent,
  parseLocator,
  mapNativeReaderError,
  parseNavigationUnit,
  parsePublicationInfo,
  parsePublicationLink,
  parsePublicationPositionsPage,
  parsePublicationSource,
  parsePublicationSummary,
  parseReaderDecoration,
  parseReaderDecorationActivationEvent,
  parseReaderError,
  parseReaderGeometry,
  parseReaderImageActivationEvent,
  parseReaderResolvedImageSource,
  parseReaderLocationEvent,
  parseReaderLinkEvent,
  parseReaderSelection,
  parseReaderSelectionSnapshot,
  parseReaderSelectionActionEvent,
  parseReaderSelectionChangeEvent,
  serializeCoreRecord,
} from './recordValidation.js';
export type { NativeReaderErrorInput } from './recordValidation.js';
export {
  DEFAULT_READER_IMAGE_POLICY,
  MAXIMUM_READER_IMAGE_SOURCE_HANDLE_UTF16_UNITS,
  normalizeReaderImagePolicy,
  readerImageSourceHandle,
  readerImageUseAllowed,
} from './internal/ReaderImagePolicy.js';
export {
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
  normalizeReaderSearchCursor,
  normalizeReaderSearchExcerpt,
  normalizeReaderSearchRequest,
  normalizeReaderSearchSessionId,
  parseReaderSearchPage,
  parseReaderSearchSession,
} from './internal/ReaderSearchPolicy.js';
export {
  DEFAULT_DECORATION_TINT,
  DEFAULT_MARGIN_ICON_TINT,
  MAXIMUM_DECORATION_CHANGES,
  MAXIMUM_DECORATION_DATA_UTF8_BYTES,
  MAXIMUM_DECORATION_GROUPS,
  MAXIMUM_DECORATION_GROUP_UTF16_UNITS,
  MAXIMUM_DECORATION_ID_UTF16_UNITS,
  MAXIMUM_DECORATIONS_PER_GROUP,
  applyReaderDecorationChanges,
  normalizeReaderDecoration,
  normalizeReaderDecorationChanges,
  normalizeReaderDecorationGroup,
  normalizeReaderDecorations,
} from './internal/DecorationPolicy.js';
export {
  MAXIMUM_NAVIGATION_UNIT_DEPTH,
  MAXIMUM_NAVIGATION_UNIT_DIAGNOSTIC_ISSUES,
  deriveNavigationUnits,
  normalizeChapterGranularity,
} from './internal/NavigationUnitPolicy.js';
export {
  MAXIMUM_NAVIGATION_HISTORY_ENTRIES,
  clearReaderNavigationHistory,
  cloneReaderNavigationHistory,
  createReaderNavigationHistory,
  navigationHistoryEntryFromLocation,
  navigationUnitContextForLocation,
  popReaderNavigationHistory,
  pushReaderNavigationHistory,
} from './internal/NavigationUnitBoundaryPolicy.js';
export {
  calculateReaderProgress,
  createReaderProgressState,
  enrichReaderLocationEvent,
  isReaderProgressLocationEvent,
  readerProgressAnchorsAreMateriallyStable,
  updateReaderProgressState,
} from './internal/ReaderProgressPolicy.js';
export {
  DEFAULT_READER_NAVIGATION_POLICY,
  logicalDirectionForHorizontalAction,
  normalizeReaderNavigationPolicy,
  parseReaderNavigationPolicyStatus,
  readerNavigationPolicyDecision,
  readerNavigationPolicySupport,
} from './internal/ReaderNavigationPolicy.js';
export {
  DEFAULT_READER_PREFERENCES,
  READER_PREFERENCE_RANGES,
  normalizeReaderPreferences,
  parseReaderPreferencesStatus,
} from './internal/ReaderPreferencesPolicy.js';
export {
  MAXIMUM_READER_DIAGNOSTIC_WARNINGS,
  READER_DIAGNOSTICS_SCHEMA_VERSION,
  createReaderDiagnosticReport,
  parseReaderDiagnostics,
} from './internal/ReaderDiagnostics.js';
export {
  MAXIMUM_TYPOGRAPHY_FONT_FAMILIES,
  MAXIMUM_TYPOGRAPHY_RULES,
  TYPOGRAPHY_FONT_WEIGHT_RANGE,
  TYPOGRAPHY_GENERIC_FONT_FAMILIES,
  TYPOGRAPHY_LINE_HEIGHT_RANGE,
  normalizeTypographyProfile,
} from './internal/TypographyProfilePolicy.js';
export {
  DEFAULT_FOOTNOTE_POLICY,
  DEFAULT_READER_LINK_POLICY,
  MAXIMUM_EXTERNAL_LINK_SCHEMES,
  MAXIMUM_FOOTNOTE_HEURISTIC_RULES,
  MAXIMUM_FOOTNOTE_MATCH_VALUE_UTF16_UNITS,
  decideExternalLink,
  decideInternalFootnote,
  normalizeFootnotePolicy,
  normalizeReaderLinkPolicy,
} from './internal/FootnoteLinkPolicy.js';
export {
  MAXIMUM_SELECTION_ACTIONS,
  MAXIMUM_SELECTION_ACTION_ID_UTF16_UNITS,
  MAXIMUM_SELECTION_ACTION_TITLE_UTF16_UNITS,
  MAXIMUM_SELECTION_CONTEXT_UTF16_UNITS,
  MAXIMUM_SELECTION_TEXT_UTF16_UNITS,
  normalizeReaderSelectionActions,
  selectionTextDirection,
} from './internal/SelectionActionPolicy.js';
export {
  MAXIMUM_ANNOTATION_NOTE_UTF16_UNITS,
  MAXIMUM_ANNOTATION_TEXT_UTF16_UNITS,
  MAXIMUM_BOOKMARK_EXCERPT_UTF16_UNITS,
  MAXIMUM_CHAPTER_TITLE_UTF16_UNITS,
  MAXIMUM_LANGUAGE_TAG_UTF16_UNITS,
  MAXIMUM_NAVIGATION_UNIT_ID_UTF16_UNITS,
  MAXIMUM_PERSISTED_ANNOTATIONS,
  MAXIMUM_PERSISTED_BOOKMARKS,
  MAXIMUM_PERSISTED_NAVIGATION_UNITS,
  MAXIMUM_PERSISTENCE_RECORD_ID_UTF16_UNITS,
  MAXIMUM_PUBLICATION_ID_UTF16_UNITS,
  normalizeReaderPersistenceRecordId,
  normalizeReaderPublicationId,
  parsePersistedReaderPreferences,
  parsePreferenceScope,
  parseReaderAnnotation,
  parseReaderAnnotationList,
  parseReaderBookmark,
  parseReaderBookmarkList,
  parseStoredReadingState,
  preferenceScopeKey,
  readerAnnotationToDecoration,
  readerBookmarkToDecoration,
  sortReaderAnnotations,
  sortReaderBookmarks,
  updateStoredReadingState,
} from './internal/PersistencePolicy.js';
export * from './persistence.js';
export * from './records.js';

export type {
  EpubReaderViewProps,
  EpubReaderViewRef,
  EpubReaderQualificationOptions,
  FootnoteClassifier,
  FootnoteClassifierDecision,
  NavigationActionEvent,
  ProgressReason,
  ProgressViewport,
  ProgressViewportResource,
  ReaderLifecycleState,
  ReaderErrorEvent,
  ReaderEventIdentity,
  ReaderReadyEvent,
  ReaderStateChangeEvent,
  ReaderProgressEvent,
  ReaderState,
  TypographyDiagnostics,
};

export const EpubReaderView = ((_props: EpubReaderViewProps): never => {
  throw new Error('EpubReaderView requires an Expo or React Native runtime.');
}) as unknown as ForwardRefExoticComponent<EpubReaderViewProps & RefAttributes<EpubReaderViewRef>>;
