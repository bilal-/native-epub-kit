import type { NativeSyntheticEvent, ViewProps } from 'react-native';

import type {
  ChapterGranularity,
  UntitledResourcePolicy,
  FootnoteEvent,
  FootnotePolicy,
  Locator,
  NavigationOptions,
  NavigationUnitSnapshot,
  NavigationUnitBoundaryEvent,
  NavigationUnitContext,
  ProgressPrecision,
  PublicationInfo,
  PublicationLink,
  PublicationPositionsPage,
  PublicationPositionsRequest,
  PublicationSource,
  ReaderDiagnostics,
  ReaderDecoration,
  ReaderDecorationActivationEvent,
  ReaderDecorationChange,
  ReaderPreferences,
  ReaderPreferencesStatus,
  ReaderError,
  ReaderErrorPhase,
  ReaderImageActivationEvent,
  ReaderImagePolicy,
  ReaderImageSource,
  ReaderImageUse,
  ReaderLocationEvent,
  ReaderLinkEvent,
  ReaderLinkPolicy,
  ReaderNavigationHistoryState,
  ReaderNavigationPolicy,
  ReaderNavigationPolicyStatus,
  ReaderSelectionAction,
  ReaderSelectionActionEvent,
  ReaderSelectionChangeEvent,
  ReaderSelectionSnapshot,
  ReaderResolvedImageSource,
  ReaderSearchOptions,
  ReaderSearchPage,
  ReaderSearchSession,
  TypographyProfile,
  TypographyPublisherStyleMode,
} from './records.ts';

export type FootnoteClassifierDecision = 'footnote' | 'navigate';
export type FootnoteClassifier = (event: Readonly<FootnoteEvent>) => FootnoteClassifierDecision;

export type ReaderLifecycleState =
  'idle' | 'opening' | 'waitingForHost' | 'ready' | 'error' | 'closing' | 'unmounted';

/** Temporary native qualification metrics used to prove production-session ownership. */
export interface PublicationSessionDiagnostics {
  activeSessions: number;
  completedSessions: number;
  forcedReleaseViolations: number;
  latestMemoryBytes?: number;
  maximumActiveSessions: number;
  maximumOwnedAssets: number;
  maximumOwnedPublications: number;
  maximumSourceLeases: number;
  memorySampleCount: number;
  ownedAssets: number;
  ownedPublications: number;
  postWarmupGrowthBytes?: number;
  postWarmupMemoryIsBounded?: boolean;
  postWarmupSlopeBytesPerCycle?: number;
  sourceLeases: number;
}

export interface ReaderState {
  code?: string;
  generation: number;
  hasNavigator: boolean;
  /** Qualification diagnostic: Readium navigators currently owned by the native host. */
  hostNavigatorCount: number;
  /** Qualification identity; generations are scoped to one native view instance. */
  instanceId: string;
  message?: string;
  phase?: ReaderErrorPhase;
  platform: 'ios' | 'android';
  recoverable?: boolean;
  /** Monotonic within one native view generation. */
  sequence: number;
  sessionDiagnostics: PublicationSessionDiagnostics;
  state: ReaderLifecycleState;
}

/** Qualification diagnostic emitted from a fixed internal probe; no script API is exposed. */
export interface TypographyDiagnostics {
  arabicDirection: string;
  arabicFontFamily: string;
  bodyBackgroundColor: string;
  bodyColor: string;
  bodyDirection: string;
  bodyFontFamily: string;
  boldFaceLoaded: boolean;
  configuredFamily: string;
  configuredFontFamily: string;
  englishDirection: string;
  englishFontFamily: string;
  fontLoaded: boolean;
  fontsStatus: string;
  generation: number;
  instanceId: string;
  locatorHref: string;
  locatorStableDuringProbe: boolean;
  linkColor: string;
  markerMode: string;
  mode: TypographyPublisherStyleMode;
  platform: 'ios' | 'android';
  quranicDirection: string;
  quranicColor: string;
  quranicFontFamily: string;
  rangeFinite: boolean;
  regularFaceLoaded: boolean;
  rootBackgroundColor: string;
  selectionApiAvailable: boolean;
  urduDirection: string;
  urduFontFamily: string;
}

export type ProgressReason =
  'initial' | 'preference-change' | 'programmatic' | 'probe' | 'restored' | 'user-scroll';

export interface ProgressViewportResource {
  endProgression: number;
  href: string;
  startProgression: number;
}

/** Qualification viewport shape. The pinned Android toolkit has no equivalent full range. */
export interface ProgressViewport {
  endOverallProgress: number;
  endPosition?: number;
  resources: ProgressViewportResource[];
  startOverallProgress: number;
  startPosition?: number;
}

/** Qualification event proving scrolled progress and the precision fallback contract. */
export interface ReaderProgressEvent {
  chapterTurnGesture: 'disabled' | 'enabled';
  generation: number;
  instanceId: string;
  layout: 'paginated' | 'scrolled';
  locator: Locator;
  overallProgress: number;
  platform: 'ios' | 'android';
  position?: number;
  precision: ProgressPrecision;
  reason: ProgressReason;
  resourceIndex: number;
  resourceProgress: number;
  /** Qualification payload identity; stable location events share the native sequence. */
  sequence?: number;
  totalPositions?: number;
  totalResources: number;
  /** Android fallback anchor when the pinned toolkit cannot expose a full viewport. */
  visibleStartLocator?: Locator;
  /** Available from the pinned Swift viewport-observing API. */
  viewport?: ProgressViewport;
}

/** Qualification result for the explicit next-reading-order-resource command. */
export interface NavigationActionEvent {
  action: 'next-resource';
  fromLocator: Locator;
  generation: number;
  instanceId: string;
  platform: 'ios' | 'android';
  success: boolean;
  toLocator?: Locator;
}

export interface ReaderEventIdentity {
  generation: number;
  instanceId: string;
  sequence: number;
}

export interface ReaderStateChangeEvent extends ReaderEventIdentity {
  error?: ReaderError;
  state: ReaderLifecycleState;
}

export interface ReaderReadyEvent extends ReaderEventIdentity {
  state: 'ready';
}

export interface ReaderErrorEvent extends ReaderEventIdentity {
  error: ReaderError;
}

/** Commands exposed by the stable reader ref; feature APIs are added by their owning tasks. */
export interface EpubReaderViewRef {
  /** Starts one generation-scoped search and cancels any previous session. */
  search(query: string, options?: ReaderSearchOptions): Promise<ReaderSearchSession>;
  /** Consumes exactly one forward-only page cursor from an active search session. */
  getSearchPage(sessionId: string, cursor?: string): Promise<ReaderSearchPage>;
  /** Cancels and releases one search iterator. Cancellation is idempotent. */
  cancelSearch(sessionId: string): Promise<void>;
  clearSelection(): Promise<void>;
  /** Clears this mounted generation's bounded in-memory jump history. */
  clearNavigationHistory(): Promise<void>;
  /** Jumps to a canonical locator or a link returned by `getPublication()`. */
  goTo(target: Locator | PublicationLink, options?: NavigationOptions): Promise<boolean>;
  /** Jumps to a publication-wide progression in the closed range 0...1. */
  goToProgression(progression: number, options?: NavigationOptions): Promise<boolean>;
  /** Jumps to a one-based position from the generation's immutable positions snapshot. */
  goToPosition(position: number, options?: NavigationOptions): Promise<boolean>;
  /** Jumps to one exact derived unit start by stable ID. */
  goToNavigationUnit(id: string, options?: NavigationOptions): Promise<boolean>;
  /** Moves to the next derived unit start; returns false at publication end. */
  goToNextNavigationUnit(options?: NavigationOptions): Promise<boolean>;
  /** Moves to the previous derived unit start; returns false at publication start. */
  goToPreviousNavigationUnit(options?: NavigationOptions): Promise<boolean>;
  /** Pops and restores the latest jump locator without adding a second entry. */
  goBack(options?: NavigationOptions): Promise<boolean>;
  /** Moves one logical content portion in the publication reading direction. */
  goForward(options?: NavigationOptions): Promise<boolean>;
  /** Moves one logical content portion opposite the publication reading direction. */
  goBackward(options?: NavigationOptions): Promise<boolean>;
  getCurrentLocation(): Promise<ReaderLocationEvent | null>;
  getCurrentSelection(): Promise<ReaderSelectionSnapshot | null>;
  /** Returns adjacent-unit state for the current canonical location. */
  getNavigationUnitContext(): Promise<NavigationUnitContext | null>;
  /** Returns a detached bounded in-memory jump history snapshot. */
  getNavigationHistory(): Promise<ReaderNavigationHistoryState>;
  /** Returns a bounded, redaction-safe support snapshot for issue reports. */
  getDiagnostics(): Promise<ReaderDiagnostics>;
  /** Derives coherent progress/navigation units from all bounded position pages. */
  getNavigationUnits(granularity?: ChapterGranularity): Promise<NavigationUnitSnapshot>;
  /** Returns requested, applied, and publication-aware support for every preference. */
  getPreferences(): Promise<ReaderPreferencesStatus>;
  /** Returns the applied input policy and whether each field is live or recreation-backed. */
  getNavigationPolicy(): Promise<ReaderNavigationPolicyStatus>;
  /** Returns the detached metadata/link/capability snapshot for this generation. */
  getPublication(): Promise<PublicationInfo>;
  /** Returns at most 256 immutable positions without sending the full list through React. */
  getPositions(request?: PublicationPositionsRequest): Promise<PublicationPositionsPage>;
  /** Materializes one generation-scoped source for an allowed app-owned zoom or share flow. */
  resolveImageSource(
    source: ReaderImageSource,
    use: ReaderImageUse
  ): Promise<ReaderResolvedImageSource>;
  /** Releases a materialized image immediately; all remaining files are released on teardown. */
  releaseImageSource(id: string): Promise<void>;
  /** Replaces one isolated decoration group after validating the whole state atomically. */
  setDecorations(group: string, decorations: readonly ReaderDecoration[]): Promise<void>;
  /** Applies one ordered, atomic add/update/remove delta to an isolated decoration group. */
  updateDecorations(group: string, changes: readonly ReaderDecorationChange[]): Promise<void>;
}

/**
 * Non-stable device-harness hooks. They are isolated from the production
 * surface and may be removed or reshaped without a semver promise.
 */
export interface EpubReaderQualificationOptions {
  onNavigationAction?: (event: NativeSyntheticEvent<NavigationActionEvent>) => void;
  onProgress?: (event: NativeSyntheticEvent<ReaderProgressEvent>) => void;
  onReaderState?: (event: NativeSyntheticEvent<ReaderState>) => void;
  onTypographyDiagnostics?: (event: NativeSyntheticEvent<TypographyDiagnostics>) => void;
  nextResourceSignal?: number;
  progressProbeSignal?: number;
}

export interface EpubReaderViewProps extends ViewProps {
  /** `null` keeps the native view mounted without an open publication. */
  source?: PublicationSource | null;
  /** Opts stable location callbacks into derived unit/chapter progress. */
  chapterGranularity?: ChapterGranularity;
  /**
   * How reading-order resources missing from the table of contents become units.
   * Defaults to `separate-units`; see {@link UntitledResourcePolicy}.
   */
  untitledResources?: UntitledResourcePolicy;
  /** Locator restored atomically when a new source generation is opened. */
  initialLocator?: Locator;
  /** Validated rendering preferences; omitted fields use stable package defaults. */
  preferences?: ReaderPreferences;
  /** Validated page/chapter/input policy; chapter turns are disabled by default. */
  navigationPolicy?: ReaderNavigationPolicy;
  /** Constrained reflowable-content style profile; it never changes reading progression. */
  typographyProfile?: TypographyProfile;
  /** Native semantic/heuristic interception policy; defaults to semantic notes only. */
  footnotePolicy?: FootnotePolicy;
  /** Safe external/unsupported scheme policy; native code never opens another application. */
  linkPolicy?: ReaderLinkPolicy;
  /** Consumer-owned image-use policy; zoom defaults on and sharing defaults off. */
  imagePolicy?: ReaderImagePolicy;
  /** Optional synchronous consumer override for an already-prevented native note candidate. */
  classifyFootnote?: FootnoteClassifier;
  /** Localized custom native menu actions; system Copy remains available. */
  selectionActions?: readonly ReaderSelectionAction[];
  /** Emitted once per successfully opened native generation. */
  onReady?: (event: ReaderReadyEvent) => void;
  /** Emitted once for a failed generation, before its `error` state callback. */
  onError?: (event: ReaderErrorEvent) => void;
  /** Ordered, throttled, stable location record. */
  onLocationChange?: (event: ReaderLocationEvent) => void;
  /** Emitted after native classification and before any note candidate can navigate. */
  onFootnotePress?: (event: FootnoteEvent) => void;
  /** Observes ordinary, external, and unsupported hyperlink activation policy. */
  onLinkPress?: (event: ReaderLinkEvent) => void;
  /** Emits metadata and an opaque source handle when the activated image is resolvable. */
  onImagePress?: (event: ReaderImageActivationEvent) => void;
  /** Emitted when a configured native selection action is invoked. */
  onSelectionAction?: (event: ReaderSelectionActionEvent) => void;
  /** Emits active snapshots and an explicit null when native handles disappear. */
  onSelectionChange?: (event: ReaderSelectionChangeEvent) => void;
  /** Emitted when the user activates a rendered decoration in any observed group. */
  onDecorationPress?: (event: ReaderDecorationActivationEvent) => void;
  /** Emitted when disabled user input attempts to leave the current exact unit. */
  onNavigationUnitBoundary?: (event: NavigationUnitBoundaryEvent) => void;
  /** Emitted after jump-history reset, push, pop, or clear. */
  onNavigationHistoryChange?: (event: ReaderNavigationHistoryState) => void;
  /** Emitted after initial policy resolution and each accepted live preference update. */
  onPreferencesChange?: (event: ReaderPreferencesStatus) => void;
  /** Emitted initially and after every accepted live or recreation-backed policy update. */
  onNavigationPolicyChange?: (event: ReaderNavigationPolicyStatus) => void;
  /** Ordered lifecycle callback; `ready` precedes `onReady`. */
  onStateChange?: (event: ReaderStateChangeEvent) => void;
  unstable_qualification?: EpubReaderQualificationOptions;
}
