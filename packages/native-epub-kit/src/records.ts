/** JSON values accepted by the public bridge and persistence boundaries. */
export type JsonValue =
  boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export const CORE_RECORD_UNITS = {
  geometry: 'logical-points-ios-density-independent-pixels-android',
  progression: 'closed-zero-to-one',
  position: 'one-based-positive-integer',
  generation: 'zero-based-safe-integer',
  sequence: 'zero-based-safe-integer',
} as const;

export const CORE_RECORD_NULLABILITY = {
  optionalFields: 'omitted',
  locatorTitle: 'string-or-null',
  jsonExtensionValues: 'may-be-null',
} as const;

export const PUBLICATION_SOURCE_KINDS = ['file', 'content', 'remote'] as const;

export type PublicationSource =
  | { kind: 'file'; uri: string }
  | { kind: 'content'; uri: string }
  | { headers?: Record<string, string>; kind: 'remote'; url: string };

/**
 * Readium locator locations. Unknown JSON extensions are retained verbatim at
 * every decode/encode and persistence boundary.
 */
export interface LocatorLocations {
  fragments?: string[];
  position?: number;
  progression?: number;
  totalProgression?: number;
  [key: string]: JsonValue | undefined;
}

/** Readium text context. Unknown JSON extensions are retained verbatim. */
export interface LocatorText {
  after?: string;
  before?: string;
  highlight?: string;
  [key: string]: JsonValue | undefined;
}

/** Canonical Readium Locator JSON. This is the only public location format. */
export interface Locator {
  href: string;
  locations?: LocatorLocations;
  text?: LocatorText;
  title?: string | null;
  type: string;
  [key: string]: JsonValue | LocatorLocations | LocatorText | undefined;
}

/** Logical points on iOS and density-independent pixels on Android. */
export interface ReaderRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface ReaderGeometry {
  coordinateSpace: 'reader-view-and-window-v1';
  /** Rectangle relative to the native reader view, in logical units. */
  viewRect?: ReaderRect;
  /** Visible intersection of `viewRect` and the reader viewport. */
  visibleViewRect?: ReaderRect;
  /** Current reader viewport size, in logical units. */
  viewport: { height: number; width: number };
  /** Rectangle relative to the native window, in logical units. */
  windowRect?: ReaderRect;
  /** Window-space counterpart of `visibleViewRect`. */
  visibleWindowRect?: ReaderRect;
}

export interface Contributor {
  identifier?: string;
  name: string;
  roles?: string[];
  sortAs?: string;
}

export interface PublicationLink {
  children: PublicationLink[];
  href: string;
  properties?: JsonObject;
  rel?: string[];
  title?: string;
  type?: string;
}

export const READING_PROGRESSIONS = ['ltr', 'rtl', 'ttb', 'btt', 'auto'] as const;
export type ReadingProgression = (typeof READING_PROGRESSIONS)[number];
export const PUBLICATION_LAYOUTS = ['reflowable', 'fixed'] as const;
export type PublicationLayout = (typeof PUBLICATION_LAYOUTS)[number];
export const PROGRESS_PRECISIONS = ['continuous', 'position', 'resource'] as const;
export type ProgressPrecision = (typeof PROGRESS_PRECISIONS)[number];

export interface PublicationCapabilities {
  customFonts: boolean;
  decorations: boolean;
  footnotes: boolean;
  /** Image activation plus generation-scoped publication-resource resolution. */
  images: boolean;
  progressPrecision: ProgressPrecision;
  search: boolean;
  selection: boolean;
  warnings: string[];
  [key: string]: JsonValue | undefined;
}

export interface PublicationSummary {
  authors: Contributor[];
  capabilities: PublicationCapabilities;
  identifier?: string;
  languages: string[];
  layout: PublicationLayout;
  positions: Locator[];
  readingOrder: PublicationLink[];
  readingProgression?: ReadingProgression;
  subtitle?: string;
  tableOfContents: PublicationLink[];
  title: string;
}

/** Detached publication data delivered without a potentially large positions array. */
export interface PublicationInfo {
  authors: Contributor[];
  capabilities: PublicationCapabilities;
  generation: number;
  identifier?: string;
  instanceId: string;
  languages: string[];
  layout: PublicationLayout;
  positionCount: number;
  readingOrder: PublicationLink[];
  readingProgression?: ReadingProgression;
  subtitle?: string;
  tableOfContents: PublicationLink[];
  title: string;
}

/** One bounded page from the immutable positions snapshot for a generation. */
export interface PublicationPositionsPage {
  generation: number;
  instanceId: string;
  nextOffset?: number;
  offset: number;
  positions: Locator[];
  total: number;
}

export interface PublicationPositionsRequest {
  limit?: number;
  offset?: number;
}

/** Options shared by explicit and logical navigation commands. */
export interface NavigationOptions {
  /** Animates the move when the native Readium navigator supports it. */
  animated?: boolean;
  /** Records the current locator before moving; defaults depend on command semantics. */
  history?: NavigationHistoryBehavior;
}

export const NAVIGATION_HISTORY_BEHAVIORS = ['push', 'ignore'] as const;
export type NavigationHistoryBehavior = (typeof NAVIGATION_HISTORY_BEHAVIORS)[number];

export const NAVIGATION_GESTURE_STATES = ['enabled', 'disabled'] as const;
export type NavigationGestureState = (typeof NAVIGATION_GESTURE_STATES)[number];

/** Consumer navigation-input policy. Omitted fields use stable package defaults. */
export interface ReaderNavigationPolicy {
  animatedTransitions?: boolean;
  chapterTurnGesture?: NavigationGestureState;
  edgeTapNavigation?: boolean;
  hardwareKeyNavigation?: boolean;
  inputSuppressed?: boolean;
  pageTurnGesture?: NavigationGestureState;
}

/** Complete validated navigation-input policy crossing the native bridge. */
export interface ResolvedReaderNavigationPolicy {
  animatedTransitions: boolean;
  chapterTurnGesture: NavigationGestureState;
  edgeTapNavigation: boolean;
  hardwareKeyNavigation: boolean;
  inputSuppressed: boolean;
  pageTurnGesture: NavigationGestureState;
}

export const READER_NAVIGATION_POLICY_NAMES = [
  'pageTurnGesture',
  'chapterTurnGesture',
  'edgeTapNavigation',
  'hardwareKeyNavigation',
  'animatedTransitions',
  'inputSuppressed',
] as const;
export type ReaderNavigationPolicyName = (typeof READER_NAVIGATION_POLICY_NAMES)[number];
export type ReaderNavigationPolicyApplication = 'live' | 'navigator-recreation';

export interface ReaderNavigationPolicySupport {
  application: ReaderNavigationPolicyApplication;
  name: ReaderNavigationPolicyName;
  supported: true;
}

export interface ReaderNavigationPolicyStatus {
  application: 'initial' | ReaderNavigationPolicyApplication;
  applied: ResolvedReaderNavigationPolicy;
  boundaryGranularity: 'navigation-unit' | 'reading-order-resource';
  boundaryPrecision: 'pending' | ProgressPrecision;
  effectiveLayout: ReaderLayout;
  generation: number;
  instanceId: string;
  readingProgression: 'ltr' | 'rtl';
  requested: ResolvedReaderNavigationPolicy;
  support: ReaderNavigationPolicySupport[];
  warnings: string[];
}

export type NavigationInputSource = 'swipe' | 'edge-tap' | 'hardware-key';
export type LogicalNavigationDirection = 'forward' | 'backward';
export type HorizontalNavigationAction = 'go-left' | 'go-right';
export type NavigationPolicyMovement = 'page' | 'chapter';
export type NavigationPolicyDecisionReason =
  | 'allowed'
  | 'chapter-turn-disabled'
  | 'edge-taps-disabled'
  | 'hardware-keys-disabled'
  | 'input-suppressed'
  | 'page-turn-disabled';

export interface NavigationPolicyDecisionInput {
  atChapterBoundary: boolean;
  direction: LogicalNavigationDirection;
  input: NavigationInputSource;
  layout: ReaderLayout;
}

export interface NavigationPolicyDecision {
  action: 'navigate' | 'ignore';
  animated: boolean;
  direction: LogicalNavigationDirection;
  movement: NavigationPolicyMovement;
  reason: NavigationPolicyDecisionReason;
}

export const READER_THEMES = ['light', 'dark', 'sepia'] as const;
export type ReaderTheme = (typeof READER_THEMES)[number];
export const READER_LAYOUTS = ['scrolled', 'paginated'] as const;
export type ReaderLayout = (typeof READER_LAYOUTS)[number];
export const READER_SPREADS = ['auto', 'never', 'always'] as const;
export type ReaderSpread = (typeof READER_SPREADS)[number];
export const READER_TEXT_ALIGNMENTS = [
  'auto',
  'start',
  'end',
  'left',
  'right',
  'center',
  'justify',
] as const;
export type ReaderTextAlignment = (typeof READER_TEXT_ALIGNMENTS)[number];
export const READER_PREFERENCE_PROGRESSIONS = ['auto', 'ltr', 'rtl'] as const;
export type ReaderPreferenceProgression = (typeof READER_PREFERENCE_PROGRESSIONS)[number];

export const TYPOGRAPHY_PUBLISHER_STYLE_MODES = ['preserve', 'hybrid', 'override'] as const;
export type TypographyPublisherStyleMode = (typeof TYPOGRAPHY_PUBLISHER_STYLE_MODES)[number];

export type TypographyRuleTarget =
  | { kind: 'language'; value: string }
  | { kind: 'direction'; value: 'ltr' | 'rtl' }
  | { kind: 'class'; value: string };

/** Closed publication-surface colors compiled without accepting consumer CSS. */
export interface ReaderColorProfile {
  background: string;
  link: string;
  text: string;
}

/** One constrained, script-free typography rule compiled by the native adapters. */
export interface TypographyRule {
  color?: string;
  direction?: 'ltr' | 'rtl';
  fontFamilies?: string[];
  fontWeight?: number;
  lineHeight?: number;
  target: TypographyRuleTarget;
}

/**
 * Typography input for reflowable publications. This intentionally contains
 * no reading-progression field: content styling and navigator direction are
 * separate contracts.
 */
export interface TypographyProfile {
  colors?: ReaderColorProfile;
  defaultFontFamilies?: string[];
  publisherStyles: TypographyPublisherStyleMode;
  rules?: TypographyRule[];
}

/** Complete, validated typography profile crossing the native bridge. */
export interface ResolvedTypographyProfile {
  colors?: ReaderColorProfile;
  defaultFontFamilies: string[];
  publisherStyles: TypographyPublisherStyleMode;
  rules: TypographyRule[];
}

/** Consumer preference input. Omitted fields use `DEFAULT_READER_PREFERENCES`. */
export interface ReaderPreferences {
  fontSize?: number;
  layout?: ReaderLayout;
  lineHeight?: number;
  pageMargins?: number;
  publisherStyles?: boolean;
  readingProgression?: ReaderPreferenceProgression;
  spread?: ReaderSpread;
  textAlignment?: ReaderTextAlignment;
  theme?: ReaderTheme;
}

/** Complete, validated preference record crossing the native bridge. */
export interface ResolvedReaderPreferences {
  fontSize: number;
  layout: ReaderLayout;
  lineHeight: number;
  pageMargins: number;
  publisherStyles: boolean;
  readingProgression: ReaderPreferenceProgression;
  spread: ReaderSpread;
  textAlignment: ReaderTextAlignment;
  theme: ReaderTheme;
}

export const READER_PREFERENCE_NAMES = [
  'theme',
  'fontSize',
  'layout',
  'spread',
  'pageMargins',
  'lineHeight',
  'textAlignment',
  'publisherStyles',
  'readingProgression',
] as const;
export type ReaderPreferenceName = (typeof READER_PREFERENCE_NAMES)[number];
export type ReaderPreferenceUnsupportedReason =
  'fixed-layout' | 'publisher-styles' | 'reflowable-layout';

export interface ReaderPreferenceSupport {
  name: ReaderPreferenceName;
  reason?: ReaderPreferenceUnsupportedReason;
  supported: boolean;
}

/** Native, publication-aware result for requested and actually applied fields. */
export interface ReaderPreferencesStatus {
  applied: Partial<ResolvedReaderPreferences>;
  generation: number;
  instanceId: string;
  publicationLayout: PublicationLayout;
  requested: ResolvedReaderPreferences;
  support: ReaderPreferenceSupport[];
  warnings: string[];
}

export const DEFAULT_PUBLICATION_POSITION_PAGE_SIZE = 128;
export const MAXIMUM_PUBLICATION_POSITION_PAGE_SIZE = 256;

export interface NavigationUnit {
  childIds: string[];
  depth: number;
  endLocator?: Locator;
  endPositionExclusive?: number;
  endTotalProgression?: number;
  href: string;
  id: string;
  parentId?: string;
  source: 'toc' | 'reading-order-fallback';
  startLocator: Locator;
  startPosition?: number;
  startTotalProgression?: number;
  title: string;
}

export const NAVIGATION_UNIT_SOURCES = ['toc', 'reading-order-fallback'] as const;

export type ChapterGranularity = 'top-level' | 'leaf' | { depth: number };

/** A duplicate TOC label retained after two entries resolve to one boundary. */
export interface NavigationUnitAlias {
  depth: number;
  href: string;
  id: string;
  title: string;
  unitId: string;
}

export const NAVIGATION_UNIT_DIAGNOSTIC_CODES = [
  'positions-unavailable',
  'position-number-mismatch',
  'reading-order-empty',
  'reading-order-duplicate-resource',
  'reading-order-fallback',
  'toc-empty',
  'toc-entry-out-of-order',
  'toc-entry-unresolved',
  'toc-entry-untitled',
  'toc-duplicate-boundary',
  'unit-position-interval-empty',
  'unit-progression-interval-empty',
] as const;
export type NavigationUnitDiagnosticCode = (typeof NAVIGATION_UNIT_DIAGNOSTIC_CODES)[number];

/** One deterministic, machine-readable derivation observation. */
export interface NavigationUnitDiagnostic {
  code: NavigationUnitDiagnosticCode;
  href?: string;
  tocId?: string;
  unitId?: string;
}

export interface NavigationUnitDerivationDiagnostics {
  aliasCount: number;
  duplicateBoundaryCount: number;
  fallbackUnitCount: number;
  issueCount: number;
  issues: NavigationUnitDiagnostic[];
  issuesTruncated: number;
  outOfOrderTocEntryCount: number;
  readingOrderResourceCount: number;
  selectedTocEntryCount: number;
  tocEntryCount: number;
  unitCount: number;
  unresolvedTocEntryCount: number;
}

export interface NavigationUnitDerivationInput {
  granularity?: ChapterGranularity;
  positions: readonly Locator[];
  readingOrder: readonly PublicationLink[];
  tableOfContents: readonly PublicationLink[];
}

/** Normalized reading-order interval used by resource-precision fallbacks. */
export interface NavigationUnitResource {
  endLocator?: Locator;
  endPositionExclusive?: number;
  endTotalProgression?: number;
  href: string;
  index: number;
  startLocator: Locator;
  startPosition?: number;
  startTotalProgression?: number;
}

/** Pure derivation result, independent of a mounted reader generation. */
export interface NavigationUnitDerivationResult {
  aliases: NavigationUnitAlias[];
  diagnostics: NavigationUnitDerivationDiagnostics;
  granularity: ChapterGranularity;
  positionCount: number;
  resources: NavigationUnitResource[];
  units: NavigationUnit[];
}

/** Derivation result tied to the coherent publication snapshot used by the ref. */
export interface NavigationUnitSnapshot extends NavigationUnitDerivationResult {
  generation: number;
  instanceId: string;
}

export const NAVIGATION_UNIT_BOUNDARY_KINDS = ['unit', 'publication'] as const;
export type NavigationUnitBoundaryKind = (typeof NAVIGATION_UNIT_BOUNDARY_KINDS)[number];
export const NAVIGATION_UNIT_BOUNDARY_SIDES = ['start', 'end'] as const;
export type NavigationUnitBoundarySide = (typeof NAVIGATION_UNIT_BOUNDARY_SIDES)[number];

/** Current unit plus adjacent controls derived from one coherent snapshot. */
export interface NavigationUnitContext {
  atEnd: boolean;
  /**
   * True when position precision places the viewport in the unit's final known
   * discrete position. This is an affordance hint, not proof of completion:
   * one position may still contain scrollable content.
   */
  atLastPosition: boolean;
  atStart: boolean;
  chapterProgress: number;
  generation: number;
  index: number;
  instanceId: string;
  locator: Locator;
  navigationUnit: NavigationUnit;
  nextNavigationUnit?: NavigationUnit;
  precision: ProgressPrecision;
  previousNavigationUnit?: NavigationUnit;
}

/** Emitted when disabled user input attempts to leave the current unit. */
export interface NavigationUnitBoundaryEvent {
  adjacentNavigationUnit?: NavigationUnit;
  boundary: NavigationUnitBoundarySide;
  direction: LogicalNavigationDirection;
  generation: number;
  instanceId: string;
  kind: NavigationUnitBoundaryKind;
  locator: Locator;
  navigationUnit: NavigationUnit;
  precision: ProgressPrecision;
  sequence: number;
}

export interface ReaderNavigationHistoryEntry {
  locator: Locator;
  navigationUnitId?: string;
}

/** Bounded ephemeral jump history. Persistence remains consumer-owned. */
export interface ReaderNavigationHistoryState {
  canGoBack: boolean;
  entries: ReaderNavigationHistoryEntry[];
  generation: number;
  instanceId: string;
  limit: number;
}

export const READER_LOCATION_REASONS = [
  'initial',
  'user-scroll',
  'user-page-turn',
  'programmatic',
  'preference-change',
  'restored',
] as const;
export type ReaderLocationReason = (typeof READER_LOCATION_REASONS)[number];

export interface ReaderVisibleRange {
  end: Locator;
  start: Locator;
}

export interface ReaderLocationEvent {
  chapterProgress?: number;
  generation: number;
  instanceId: string;
  locator: Locator;
  navigationUnit?: NavigationUnit;
  overallProgress?: number;
  position?: number;
  precision: ProgressPrecision;
  reason: ReaderLocationReason;
  sequence: number;
  totalPositions?: number;
  visibleRange?: ReaderVisibleRange;
}

/** Location event after navigation-unit membership and progress derivation. */
export interface ReaderProgressLocationEvent extends ReaderLocationEvent {
  chapterProgress: number;
  navigationUnit: NavigationUnit;
  overallProgress: number;
}

export interface ReaderProgressCheckpoint {
  chapterProgress: number;
  locator: Locator;
  navigationUnitId: string;
  overallProgress: number;
  position?: number;
  precision: ProgressPrecision;
}

export interface NavigationUnitProgressState {
  currentProgress: number;
  furthestProgress: number;
}

/** Headless reducer state; persistence and completion timestamps remain consumer-owned. */
export interface ReaderProgressControllerState {
  current: ReaderProgressCheckpoint;
  furthest: ReaderProgressCheckpoint;
  generation: number;
  instanceId: string;
  units: Record<string, NavigationUnitProgressState>;
}

export interface ReaderProgressStabilityOptions {
  positionTolerance?: number;
  progressionTolerance?: number;
}

export const TEXT_DIRECTIONS = ['ltr', 'rtl', 'auto'] as const;
export type TextDirection = (typeof TEXT_DIRECTIONS)[number];

export interface ReaderSelection {
  /** Whether Readium currently permits this text to cross the native boundary. */
  copyAllowed?: boolean;
  direction?: TextDirection;
  geometry?: ReaderGeometry;
  language?: string;
  locator: Locator;
  navigationUnitId?: string;
  /** Empty when Readium copy rights prohibit selected text from crossing the bridge. */
  text: string;
  /** True when selected text or locator context was bounded at a grapheme boundary. */
  truncated?: boolean;
}

export type SelectionActionId = 'highlight' | 'note' | 'share' | (string & {});

/** One localized custom item added to the native selection menu. */
export interface ReaderSelectionAction {
  id: SelectionActionId;
  title: string;
}

/** Fully resolved action shape sent atomically with the native open request. */
export interface ResolvedReaderSelectionAction {
  id: string;
  title: string;
}

/** Rights-aware production selection payload emitted by events and the reader ref. */
export interface ReaderSelectionSnapshot extends ReaderSelection {
  copyAllowed: boolean;
  truncated: boolean;
}

export const READER_SELECTION_CHANGE_REASONS = [
  'started',
  'changed',
  'cleared',
  'dismissed',
] as const;
export type ReaderSelectionChangeReason = (typeof READER_SELECTION_CHANGE_REASONS)[number];

export interface ReaderSelectionChangeEvent {
  generation: number;
  handlesActive: boolean;
  instanceId: string;
  platform: 'ios' | 'android';
  reason: ReaderSelectionChangeReason;
  /** Null only for `cleared` and `dismissed`. */
  selection: ReaderSelectionSnapshot | null;
  sequence: number;
}

export interface ReaderSelectionActionEvent {
  actionId: SelectionActionId;
  generation: number;
  handlesActive: boolean;
  instanceId: string;
  platform: 'ios' | 'android';
  selection: ReaderSelectionSnapshot;
  sequence: number;
}

export const DECORATION_MARGIN_ICON_ASSETS = ['bookmark', 'note'] as const;
export type ReaderDecorationMarginIconAsset = (typeof DECORATION_MARGIN_ICON_ASSETS)[number];

export const DECORATION_CUSTOM_TEMPLATES = ['rounded-box-v1'] as const;
export type ReaderDecorationCustomTemplate = (typeof DECORATION_CUSTOM_TEMPLATES)[number];

export interface ReaderDecorationCustomConfig {
  borderRadius?: number;
  borderWidth?: number;
  fillOpacity?: number;
  isActive?: boolean;
  tint?: string;
}

export type ReaderDecorationStyle =
  | { isActive?: boolean; tint: string; type: 'highlight' }
  | { isActive?: boolean; tint: string; type: 'underline' }
  | { asset: ReaderDecorationMarginIconAsset; tint?: string; type: 'margin-icon' }
  | {
      config?: ReaderDecorationCustomConfig;
      template: ReaderDecorationCustomTemplate;
      type: 'custom';
    };

export const DECORATION_STYLE_TYPES = ['highlight', 'underline', 'margin-icon', 'custom'] as const;

export interface ReaderDecoration {
  data?: JsonValue;
  id: string;
  locator: Locator;
  style: ReaderDecorationStyle;
}

export const DECORATION_CHANGE_TYPES = ['add', 'update', 'remove'] as const;
export type ReaderDecorationChangeType = (typeof DECORATION_CHANGE_TYPES)[number];

export type ReaderDecorationChange =
  { decoration: ReaderDecoration; type: 'add' | 'update' } | { id: string; type: 'remove' };

export interface ReaderDecorationActivationEvent {
  decoration: ReaderDecoration;
  generation: number;
  geometry?: ReaderGeometry;
  group: string;
  instanceId: string;
  platform: 'ios' | 'android';
  sequence: number;
}

export interface FootnoteEvent {
  classification: 'semantic' | 'heuristic';
  contentType?: string;
  direction?: TextDirection;
  generation: number;
  geometry?: ReaderGeometry;
  href: string;
  html?: string;
  id?: string;
  instanceId: string;
  language?: string;
  platform: 'ios' | 'android';
  referrer?: string;
  sourceLocator: Locator;
  targetLocator?: Locator;
  text: string;
  truncated: boolean;
}

export const FOOTNOTE_CLASSIFICATIONS = ['semantic', 'heuristic'] as const;
export type FootnoteClassification = (typeof FOOTNOTE_CLASSIFICATIONS)[number];
export const FOOTNOTE_POLICY_MODES = ['navigate', 'semantic', 'semantic-and-heuristic'] as const;
export type FootnotePolicyMode = (typeof FOOTNOTE_POLICY_MODES)[number];

/**
 * One closed, declarative matcher evaluated natively before internal-link
 * navigation. Every configured field must match; raw regular expressions are
 * intentionally unsupported.
 */
export interface FootnoteHeuristicRule {
  fragmentPrefix?: string;
  fragmentSuffix?: string;
  id: string;
  resourceSuffix?: string;
}

export interface FootnotePolicy {
  heuristicRules?: readonly FootnoteHeuristicRule[];
  mode: FootnotePolicyMode;
}

export interface ResolvedFootnotePolicy {
  heuristicRules: FootnoteHeuristicRule[];
  mode: FootnotePolicyMode;
}

export const EXTERNAL_LINK_POLICIES = ['intercept', 'block'] as const;
export type ExternalLinkPolicy = (typeof EXTERNAL_LINK_POLICIES)[number];
export const UNSUPPORTED_SCHEME_POLICIES = ['intercept', 'block'] as const;
export type UnsupportedSchemePolicy = (typeof UNSUPPORTED_SCHEME_POLICIES)[number];

/**
 * Native code never opens another application. Intercepted links are emitted
 * for the consumer to confirm and open; blocked links remain observable but
 * carry a blocked disposition.
 */
export interface ReaderLinkPolicy {
  allowedExternalSchemes?: readonly string[];
  externalLinks?: ExternalLinkPolicy;
  unsupportedSchemes?: UnsupportedSchemePolicy;
}

export interface ResolvedReaderLinkPolicy {
  allowedExternalSchemes: string[];
  externalLinks: ExternalLinkPolicy;
  unsupportedSchemes: UnsupportedSchemePolicy;
}

export const READER_LINK_KINDS = ['internal', 'external', 'unsupported'] as const;
export type ReaderLinkKind = (typeof READER_LINK_KINDS)[number];
export const READER_LINK_DISPOSITIONS = ['followed', 'intercepted', 'blocked'] as const;
export type ReaderLinkDisposition = (typeof READER_LINK_DISPOSITIONS)[number];

export interface ReaderLinkEvent {
  contentType?: string;
  disposition: ReaderLinkDisposition;
  generation: number;
  geometry?: ReaderGeometry;
  href: string;
  instanceId: string;
  kind: ReaderLinkKind;
  platform: 'ios' | 'android';
  referrer?: string;
  scheme?: string;
  sourceLocator: Locator;
  targetLocator?: Locator;
}

export const READER_IMAGE_USES = ['zoom', 'share'] as const;
export type ReaderImageUse = (typeof READER_IMAGE_USES)[number];

export const READER_IMAGE_SOURCE_KINDS = [
  'publication-resource',
  'inline-svg',
  'external',
] as const;
export type ReaderImageSourceKind = (typeof READER_IMAGE_SOURCE_KINDS)[number];

export const READER_IMAGE_UNRESOLVED_REASONS = [
  'external-resource',
  'resource-not-found',
  'source-too-large',
  'unsupported-source',
] as const;
export type ReaderImageUnresolvedReason = (typeof READER_IMAGE_UNRESOLVED_REASONS)[number];

/** Consumer-owned usage policy. Zoom is enabled and sharing is fail-closed by default. */
export interface ReaderImagePolicy {
  allowSharing?: boolean;
  allowZoom?: boolean;
}

export interface ResolvedReaderImagePolicy {
  allowSharing: boolean;
  allowZoom: boolean;
}

/** Policy snapshot attached to an activation event. This is not a DRM boundary. */
export interface ReaderImageRights {
  canShare: boolean;
  canZoom: boolean;
}

/**
 * A generation-scoped image descriptor. `handle` is opaque and is only present
 * when the exact source can be resolved through `resolveImageSource()`.
 */
export interface ReaderImageSource {
  contentType?: string;
  handle?: string;
  href?: string;
  kind: ReaderImageSourceKind;
  resolvable: boolean;
  unresolvedReason?: ReaderImageUnresolvedReason;
}

export interface ReaderImageActivationEvent {
  alt?: string;
  caption?: string;
  generation: number;
  geometry?: ReaderGeometry;
  instanceId: string;
  locator: Locator;
  platform: 'ios' | 'android';
  rights: ReaderImageRights;
  sequence: number;
  source: ReaderImageSource;
}

/** A bounded local file owned by the mounted native reader generation. */
export interface ReaderResolvedImageSource {
  byteLength: number;
  contentType: string;
  id: string;
  uri: string;
}

/** Cross-platform search options supported consistently by both pinned toolkits. */
export interface ReaderSearchOptions {
  caseSensitive?: boolean;
  diacriticSensitive?: boolean;
  /** BCP 47 language override for language-aware matching. */
  language?: string;
  /** Results returned by each bridge page; defaults to 50 and never exceeds 100. */
  pageSize?: number;
}

export interface ResolvedReaderSearchOptions {
  caseSensitive: boolean;
  diacriticSensitive: boolean;
  language?: string;
  pageSize: number;
}

export interface ReaderSearchDecorationGroups {
  /** All loaded results; replacing this group never mutates annotations. */
  results: 'search.results:v1';
  /** The independently styled currently selected result. */
  current: 'search.current:v1';
}

/** One generation-scoped, forward-only native search iterator. */
export interface ReaderSearchSession {
  decorationGroups: ReaderSearchDecorationGroups;
  generation: number;
  id: string;
  instanceId: string;
  nextCursor: string;
  options: ResolvedReaderSearchOptions;
  query: string;
}

export interface ReaderSearchExcerpt {
  after: string;
  before: string;
  highlight: string;
  /** At least one native text field exceeded the public bridge bound. */
  truncated: boolean;
}

export interface ReaderSearchNavigationUnitContext {
  id: string;
  index: number;
  precision: ProgressPrecision;
}

export interface ReaderSearchResult {
  excerpt: ReaderSearchExcerpt;
  /** Stable within one session and safe as a decoration identifier. */
  id: string;
  /** Zero-based result index within the session. */
  index: number;
  locator: Locator;
  navigationUnit?: ReaderSearchNavigationUnitContext;
  resourceTitle?: string;
}

/** One bounded, forward-only page. A cursor can be consumed exactly once. */
export interface ReaderSearchPage {
  complete: boolean;
  cursor: string;
  generation: number;
  instanceId: string;
  /** Number of results emitted by this session through this page. */
  loadedResultCount: number;
  nextCursor?: string;
  results: ReaderSearchResult[];
  sessionId: string;
  /** The hard result ceiling was reached; more publication matches may exist. */
  truncated: boolean;
}

/** Compatibility aliases matching Readium's feature terminology. */
export type SearchOptions = ReaderSearchOptions;
export type SearchSession = ReaderSearchSession;
export type SearchPage = ReaderSearchPage;
export type SearchResult = ReaderSearchResult;

export const NATIVE_PLATFORMS = ['ios', 'android'] as const;
export type NativePlatform = (typeof NATIVE_PLATFORMS)[number];

export const READER_DIAGNOSTIC_FEATURE_NAMES = [
  'local-file-source',
  'content-uri-source',
  'remote-source',
  'publication-data',
  'positions',
  'navigation',
  'restore',
  'preferences',
  'progress',
  'selection',
  'footnotes',
  'custom-fonts',
  'decorations',
  'images',
  'search',
  'diagnostics',
] as const;
export type ReaderDiagnosticFeatureName = (typeof READER_DIAGNOSTIC_FEATURE_NAMES)[number];
export const READER_DIAGNOSTIC_FEATURE_STAGES = [
  'stable',
  'qualification',
  'planned',
  'unsupported',
] as const;
export type ReaderDiagnosticFeatureStage = (typeof READER_DIAGNOSTIC_FEATURE_STAGES)[number];
export const READER_FONT_MANIFEST_STATUSES = ['not-configured', 'valid', 'invalid'] as const;
export type ReaderFontManifestStatus = (typeof READER_FONT_MANIFEST_STATUSES)[number];
export const READER_TOOLKIT_NAMES = ['readium-swift', 'readium-kotlin'] as const;
export type ReaderToolkitName = (typeof READER_TOOLKIT_NAMES)[number];

export interface ReaderDiagnosticFeature {
  enabled: boolean;
  name: ReaderDiagnosticFeatureName;
  stage: ReaderDiagnosticFeatureStage;
}

export interface ReaderFontManifestDiagnostics {
  faceCount: number;
  familyCount: number;
  status: ReaderFontManifestStatus;
}

export interface ReaderToolkitDiagnostics {
  name: ReaderToolkitName;
  revision: string;
  version: string;
}

export interface ReaderPublicationDiagnostics {
  format: 'epub';
  layout: PublicationLayout;
  mappingDurationMilliseconds: number;
  positionCount: number;
  progressPrecision: ProgressPrecision;
  readingProgression: ReadingProgression;
  warnings: string[];
}

export interface ReaderPreferenceDiagnostics {
  applied: Partial<ResolvedReaderPreferences>;
  requested: ResolvedReaderPreferences;
  support: ReaderPreferenceSupport[];
  warnings: string[];
}

/** Redaction-safe, publication-scoped support snapshot for issue reports. */
export interface ReaderDiagnostics {
  features: ReaderDiagnosticFeature[];
  fonts: ReaderFontManifestDiagnostics;
  generation: number;
  platform: NativePlatform;
  preferences: ReaderPreferenceDiagnostics;
  publication: ReaderPublicationDiagnostics;
  redaction: { profile: 'support-v1' };
  schemaVersion: 1;
  sdk: { name: 'native-epub-kit'; version: string };
  toolkit: ReaderToolkitDiagnostics;
  warnings: string[];
}

export const READER_ERROR_CODES = [
  'SOURCE_NOT_FOUND',
  'SOURCE_PERMISSION_DENIED',
  'UNSUPPORTED_FORMAT',
  'PUBLICATION_OPEN_FAILED',
  'PUBLICATION_PROTECTED',
  'NAVIGATOR_CREATION_FAILED',
  'RESOURCE_LOAD_FAILED',
  'INVALID_LOCATOR',
  'NAVIGATION_FAILED',
  'SEARCH_FAILED',
  'READER_NOT_READY',
  'READER_DESTROYED',
  'TYPOGRAPHY_CONFIGURATION_FAILED',
  'NATIVE_INVARIANT_VIOLATION',
] as const;

export type ReaderErrorCode = (typeof READER_ERROR_CODES)[number];

export const READER_ERROR_PHASES = [
  'source',
  'open',
  'render',
  'navigate',
  'search',
  'resource',
  'close',
] as const;

export type ReaderErrorPhase = (typeof READER_ERROR_PHASES)[number];

export interface ReaderError {
  code: ReaderErrorCode;
  message: string;
  nativeDetails?: JsonValue;
  phase: ReaderErrorPhase;
  publicationUri?: string;
  recoverable: boolean;
}

export type CoreRecordType =
  | 'publicationSource'
  | 'locator'
  | 'readerGeometry'
  | 'publicationSummary'
  | 'navigationUnit'
  | 'readerLocationEvent'
  | 'readerSelection'
  | 'readerSelectionChangeEvent'
  | 'readerSelectionActionEvent'
  | 'readerDecoration'
  | 'readerDecorationActivationEvent'
  | 'footnoteEvent'
  | 'readerLinkEvent'
  | 'readerImageActivationEvent'
  | 'readerError';

export interface CoreRecordMap {
  footnoteEvent: FootnoteEvent;
  locator: Locator;
  navigationUnit: NavigationUnit;
  publicationSource: PublicationSource;
  publicationSummary: PublicationSummary;
  readerDecoration: ReaderDecoration;
  readerDecorationActivationEvent: ReaderDecorationActivationEvent;
  readerError: ReaderError;
  readerGeometry: ReaderGeometry;
  readerImageActivationEvent: ReaderImageActivationEvent;
  readerLocationEvent: ReaderLocationEvent;
  readerLinkEvent: ReaderLinkEvent;
  readerSelection: ReaderSelection;
  readerSelectionActionEvent: ReaderSelectionActionEvent;
  readerSelectionChangeEvent: ReaderSelectionChangeEvent;
}
