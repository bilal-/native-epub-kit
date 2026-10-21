import { requireNativeView } from 'expo';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentType,
  type RefAttributes,
} from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

import type {
  EpubReaderViewProps,
  EpubReaderViewRef,
  NavigationActionEvent,
  ReaderProgressEvent,
  ReaderState,
  TypographyDiagnostics,
} from './EpubReaderView.types.ts';
import {
  normalizeReaderDecorationChanges,
  normalizeReaderDecorations,
} from './internal/DecorationPolicy.ts';
import {
  normalizeFootnotePolicy,
  normalizeReaderLinkPolicy,
} from './internal/FootnoteLinkPolicy.ts';
import {
  readerDestroyedError,
  unwrapNativeCommand,
  type NativeCommandResult,
} from './internal/NativeCommand.ts';
import {
  invalidNavigationInput,
  normalizeNavigationPosition,
  normalizeNavigationProgression,
  normalizeNavigationRequestOptions,
  normalizeNavigationTarget,
  parseNavigationBoolean,
} from './internal/NavigationPolicy.ts';
import {
  clearReaderNavigationHistory,
  cloneReaderNavigationHistory,
  createNativeNavigationUnitBoundaryConfiguration,
  createReaderNavigationHistory,
  navigationHistoryEntryFromFollowedLink,
  navigationHistoryEntryFromLocation,
  navigationUnitContextForLocation,
  parseNativeNavigationUnitBoundaryEvent,
  popReaderNavigationHistory,
  pushReaderNavigationHistory,
} from './internal/NavigationUnitBoundaryPolicy.ts';
import {
  loadNavigationUnitSnapshot,
  normalizeChapterGranularity,
  normalizeUntitledResourcePolicy,
} from './internal/NavigationUnitPolicy.ts';
import { normalizePublicationPositionRequest } from './internal/PublicationDataPolicy.ts';
import { parseReaderDiagnostics } from './internal/ReaderDiagnostics.ts';
import {
  normalizeReaderImagePolicy,
  readerImageSourceHandle,
} from './internal/ReaderImagePolicy.ts';
import {
  normalizeReaderNavigationPolicy,
  parseReaderNavigationPolicyStatus,
} from './internal/ReaderNavigationPolicy.ts';
import {
  normalizeReaderPreferences,
  parseReaderPreferencesStatus,
} from './internal/ReaderPreferencesPolicy.ts';
import { enrichReaderLocationEvent } from './internal/ReaderProgressPolicy.ts';
import {
  normalizeReaderSearchCursor,
  normalizeReaderSearchRequest,
  normalizeReaderSearchSessionId,
  parseReaderSearchPage,
  parseReaderSearchSession,
} from './internal/ReaderSearchPolicy.ts';
import { dispatchReaderStateEvent } from './internal/ReaderStateEvents.ts';
import { normalizeReaderSelectionActions } from './internal/SelectionActionPolicy.ts';
import { normalizeTypographyProfile } from './internal/TypographyProfilePolicy.ts';
import {
  parsePublicationSource,
  parsePublicationInfo,
  parsePublicationPositionsPage,
  parseFootnoteEvent,
  parseReaderLocationEvent,
  parseReaderLinkEvent,
  parseReaderSelectionSnapshot,
  parseReaderSelectionActionEvent,
  parseReaderSelectionChangeEvent,
  parseReaderDecorationActivationEvent,
  parseReaderImageActivationEvent,
  parseReaderResolvedImageSource,
  parseLocator,
  serializeCoreRecord,
} from './recordValidation.ts';
import type {
  ChapterGranularity,
  UntitledResourcePolicy,
  NavigationOptions,
  NavigationUnitSnapshot,
  ReaderLocationEvent,
  ReaderLinkEvent,
  ReaderDecorationActivationEvent,
  ReaderImageActivationEvent,
  ReaderNavigationHistoryEntry,
  ReaderNavigationHistoryState,
  ReaderSelectionActionEvent,
  ReaderSelectionChangeEvent,
} from './records.ts';

interface NativeEpubReaderViewRef {
  cancelSearch(sessionId: string): Promise<NativeCommandResult>;
  clearSelection(): Promise<NativeCommandResult>;
  getCurrentLocation(): Promise<NativeCommandResult>;
  getCurrentSelection(): Promise<NativeCommandResult>;
  getDiagnostics(): Promise<NativeCommandResult>;
  getNavigationPolicy(): Promise<NativeCommandResult>;
  getPositions(offset: number, limit: number): Promise<NativeCommandResult>;
  getPreferences(): Promise<NativeCommandResult>;
  getPublication(): Promise<NativeCommandResult>;
  getSearchPage(sessionId: string, cursor: string): Promise<NativeCommandResult>;
  releaseImageSource(id: string): Promise<NativeCommandResult>;
  resolveImageSource(handle: string, use: string): Promise<NativeCommandResult>;
  goBackward(animated: boolean): Promise<NativeCommandResult>;
  goForward(animated: boolean): Promise<NativeCommandResult>;
  goToLink(href: string, animated: boolean): Promise<NativeCommandResult>;
  goToLocator(locatorJson: string, animated: boolean): Promise<NativeCommandResult>;
  goToPosition(position: number, animated: boolean): Promise<NativeCommandResult>;
  goToProgression(progression: number, animated: boolean): Promise<NativeCommandResult>;
  setNavigationUnitBoundaries(configurationJson: string): Promise<NativeCommandResult>;
  setDecorations(group: string, decorationsJson: string): Promise<NativeCommandResult>;
  startSearch(query: string, optionsJson: string): Promise<NativeCommandResult>;
  updateDecorations(group: string, changesJson: string): Promise<NativeCommandResult>;
}

interface NativeEpubReaderViewProps extends ViewProps {
  footnotePolicyJson?: string;
  imagePolicyJson?: string;
  linkPolicyJson?: string;
  nextResourceSignal?: number;
  onFootnotePress?: (event: NativeSyntheticEvent<unknown>) => void;
  onImagePress?: (event: NativeSyntheticEvent<unknown>) => void;
  onDecorationPress?: (event: NativeSyntheticEvent<unknown>) => void;
  onLinkPress?: (event: NativeSyntheticEvent<unknown>) => void;
  onLocationChange?: (event: NativeSyntheticEvent<unknown>) => void;
  onNavigationAction?: (event: NativeSyntheticEvent<NavigationActionEvent>) => void;
  onNavigationUnitBoundary?: (event: NativeSyntheticEvent<unknown>) => void;
  onNavigationPolicyChange?: (event: NativeSyntheticEvent<unknown>) => void;
  onPreferencesChange?: (event: NativeSyntheticEvent<unknown>) => void;
  onProgress?: (event: NativeSyntheticEvent<ReaderProgressEvent>) => void;
  onReaderState?: (event: NativeSyntheticEvent<ReaderState>) => void;
  onSelectionAction?: (event: NativeSyntheticEvent<unknown>) => void;
  onSelectionChange?: (event: NativeSyntheticEvent<unknown>) => void;
  onTypographyDiagnostics?: (event: NativeSyntheticEvent<TypographyDiagnostics>) => void;
  progressProbeSignal?: number;
  sourceJson?: string | null;
}

interface ReaderGenerationIdentity {
  generation: number;
  instanceId: string;
}

interface LocationEnhancementSession extends ReaderGenerationIdentity {
  granularityKey: string;
  initialLocationPromise: Promise<ReaderLocationEvent | null>;
  pending: ReaderLocationEvent[];
  promise: Promise<NavigationUnitSnapshot | null>;
  resolveInitialLocation: (location: ReaderLocationEvent | null) => void;
  snapshot?: NavigationUnitSnapshot;
  status: 'loading' | 'ready' | 'failed';
}

const MAXIMUM_PENDING_LOCATION_EVENTS = 32;
const INITIAL_LOCATION_TIMEOUT_MILLISECONDS = 2_000;

function granularityKey(
  granularity: ChapterGranularity,
  untitledResources: UntitledResourcePolicy
): string {
  const granularityPart =
    typeof granularity === 'string' ? granularity : `depth:${granularity.depth}`;
  return `${granularityPart}|${untitledResources}`;
}

function identitiesMatch(left: ReaderGenerationIdentity, right: ReaderGenerationIdentity): boolean {
  return left.generation === right.generation && left.instanceId === right.instanceId;
}

async function loadNavigationSnapshotFromNative(
  native: NativeEpubReaderViewRef,
  granularity: ChapterGranularity | undefined,
  untitledResources: UntitledResourcePolicy
): Promise<NavigationUnitSnapshot> {
  return loadNavigationUnitSnapshot(
    {
      async getPositions(request) {
        const { limit, offset } = normalizePublicationPositionRequest(request);
        return unwrapNativeCommand(await native.getPositions(offset, limit), (value) =>
          parsePublicationPositionsPage(value)
        );
      },
      async getPublication() {
        return unwrapNativeCommand(await native.getPublication(), (value) =>
          parsePublicationInfo(value)
        );
      },
    },
    granularity,
    untitledResources
  );
}

async function waitForInitialLocation(
  session: LocationEnhancementSession
): Promise<ReaderLocationEvent | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      session.initialLocationPromise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), INITIAL_LOCATION_TIMEOUT_MILLISECONDS);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

const NativeEpubReaderView: ComponentType<
  NativeEpubReaderViewProps & RefAttributes<NativeEpubReaderViewRef>
> = requireNativeView('NativeEpubKit');

const EpubReaderView = forwardRef<EpubReaderViewRef, EpubReaderViewProps>(function EpubReaderView(
  {
    chapterGranularity,
    untitledResources,
    classifyFootnote,
    footnotePolicy,
    imagePolicy,
    linkPolicy,
    navigationPolicy,
    onError,
    onDecorationPress,
    onFootnotePress,
    onImagePress,
    onLinkPress,
    onLocationChange,
    onNavigationHistoryChange,
    onNavigationUnitBoundary,
    onNavigationPolicyChange,
    onPreferencesChange,
    onReady,
    onSelectionAction,
    onSelectionChange,
    onStateChange,
    initialLocator,
    preferences,
    source,
    selectionActions,
    typographyProfile,
    unstable_qualification: qualification,
    ...viewProps
  },
  ref
) {
  const nativeRef = useRef<NativeEpubReaderViewRef>(null);
  const mountedRef = useRef(true);
  const readyIdentityRef = useRef<ReaderGenerationIdentity | null>(null);
  const locationEnhancementRef = useRef<LocationEnhancementSession | null>(null);
  const navigationHistoryRef = useRef<ReaderNavigationHistoryState | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const classifyFootnoteRef = useRef(classifyFootnote);
  const onFootnotePressRef = useRef(onFootnotePress);
  const onLinkPressRef = useRef(onLinkPress);
  const onNavigationHistoryChangeRef = useRef(onNavigationHistoryChange);
  const ensureLocationEnhancementRef = useRef<
    (identity: ReaderGenerationIdentity) => LocationEnhancementSession | null
  >(() => null);
  const resolvedChapterGranularity = useMemo(
    () =>
      chapterGranularity === undefined ? null : normalizeChapterGranularity(chapterGranularity),
    [chapterGranularity]
  );
  const resolvedUntitledResources = normalizeUntitledResourcePolicy(untitledResources);
  const untitledResourcesRef = useRef(resolvedUntitledResources);
  untitledResourcesRef.current = resolvedUntitledResources;
  const resolvedChapterGranularityKey =
    resolvedChapterGranularity === null
      ? null
      : granularityKey(resolvedChapterGranularity, resolvedUntitledResources);
  const chapterGranularityRef = useRef<ChapterGranularity | null>(resolvedChapterGranularity);
  const chapterGranularityKeyRef = useRef<string | null>(resolvedChapterGranularityKey);
  onLocationChangeRef.current = onLocationChange;
  classifyFootnoteRef.current = classifyFootnote;
  onFootnotePressRef.current = onFootnotePress;
  onLinkPressRef.current = onLinkPress;
  onNavigationHistoryChangeRef.current = onNavigationHistoryChange;
  chapterGranularityRef.current = resolvedChapterGranularity;
  chapterGranularityKeyRef.current = resolvedChapterGranularityKey;

  const emitNavigationHistory = (state: ReaderNavigationHistoryState) => {
    onNavigationHistoryChangeRef.current?.(cloneReaderNavigationHistory(state));
  };

  const historyForIdentity = (identity: ReaderGenerationIdentity) => {
    const current = navigationHistoryRef.current;
    if (current && identitiesMatch(current, identity)) return current;
    const next = createReaderNavigationHistory(identity);
    navigationHistoryRef.current = next;
    return next;
  };

  const recordNavigationHistoryEntry = (
    identity: ReaderGenerationIdentity,
    entry: ReaderNavigationHistoryEntry
  ) => {
    const current = historyForIdentity(identity);
    const next = pushReaderNavigationHistory(current, entry);
    navigationHistoryRef.current = next;
    emitNavigationHistory(next);
  };

  const recordNavigationHistory = (location: ReaderLocationEvent) => {
    recordNavigationHistoryEntry(location, navigationHistoryEntryFromLocation(location));
  };

  const readNativeCurrentLocation = async (
    native: NativeEpubReaderViewRef
  ): Promise<ReaderLocationEvent | null> =>
    unwrapNativeCommand(await native.getCurrentLocation(), (value) =>
      value == null ? null : parseReaderLocationEvent(value)
    );

  const navigationSnapshotForLocation = async (
    native: NativeEpubReaderViewRef,
    location: ReaderLocationEvent
  ): Promise<NavigationUnitSnapshot | null> => {
    const configuredGranularity = chapterGranularityRef.current;
    if (configuredGranularity !== null) {
      const session = ensureLocationEnhancementRef.current(location);
      const snapshot = session?.snapshot ?? (await session?.promise);
      return snapshot && identitiesMatch(snapshot, location) ? snapshot : null;
    }
    const snapshot = await loadNavigationSnapshotFromNative(
      native,
      'top-level',
      untitledResourcesRef.current
    );
    return identitiesMatch(snapshot, location) ? snapshot : null;
  };

  const performNavigationWithHistory = async (
    native: NativeEpubReaderViewRef,
    options: NavigationOptions | undefined,
    defaultHistory: 'push' | 'ignore',
    action: (animated: boolean) => Promise<NativeCommandResult>,
    knownLocation?: ReaderLocationEvent | null
  ): Promise<boolean> => {
    const normalized = normalizeNavigationRequestOptions(options, defaultHistory);
    const location =
      normalized.history === 'push'
        ? knownLocation === undefined
          ? await readNativeCurrentLocation(native)
          : knownLocation
        : null;
    const moved = unwrapNativeCommand(await action(normalized.animated), parseNavigationBoolean);
    if (moved && location) recordNavigationHistory(location);
    return moved;
  };

  const emitPendingLocations = (
    session: LocationEnhancementSession,
    snapshot?: NavigationUnitSnapshot
  ) => {
    const pending = session.pending.splice(0);
    if (!mountedRef.current) return;
    for (const location of pending) {
      onLocationChangeRef.current?.(
        snapshot === undefined ? location : enrichReaderLocationEvent(location, snapshot)
      );
    }
  };

  ensureLocationEnhancementRef.current = (identity) => {
    const native = nativeRef.current;
    const granularity = chapterGranularityRef.current;
    const key = chapterGranularityKeyRef.current;
    if (!native || granularity === null || key === null) return null;

    const existing = locationEnhancementRef.current;
    if (
      existing &&
      existing.status !== 'failed' &&
      identitiesMatch(existing, identity) &&
      existing.granularityKey === key
    ) {
      return existing;
    }
    if (existing) {
      existing.status = 'failed';
      emitPendingLocations(existing);
    }

    let resolveInitialLocation!: (location: ReaderLocationEvent | null) => void;
    const initialLocationPromise = new Promise<ReaderLocationEvent | null>((resolve) => {
      resolveInitialLocation = resolve;
    });
    const session: LocationEnhancementSession = {
      ...identity,
      granularityKey: key,
      initialLocationPromise,
      pending: [],
      promise: Promise.resolve(null),
      resolveInitialLocation,
      status: 'loading',
    };
    locationEnhancementRef.current = session;
    session.promise = loadNavigationSnapshotFromNative(
      native,
      granularity,
      untitledResourcesRef.current
    )
      .then(async (snapshot) => {
        const stillConfigured = chapterGranularityKeyRef.current === session.granularityKey;
        const stillReady = readyIdentityRef.current
          ? identitiesMatch(readyIdentityRef.current, session)
          : false;
        if (
          !mountedRef.current ||
          locationEnhancementRef.current !== session ||
          session.status !== 'loading' ||
          !stillConfigured ||
          !stillReady ||
          !identitiesMatch(snapshot, session)
        ) {
          if (
            mountedRef.current &&
            locationEnhancementRef.current === session &&
            session.status === 'loading'
          ) {
            session.status = 'failed';
            emitPendingLocations(session);
          }
          return null;
        }
        const currentLocation =
          (await readNativeCurrentLocation(native)) ?? (await waitForInitialLocation(session));
        if (!currentLocation || !identitiesMatch(currentLocation, session)) {
          throw new TypeError(
            `Native navigation-unit boundary identity changed while loading (expected ${session.instanceId}/${session.generation}, received ${currentLocation?.instanceId ?? 'none'}/${currentLocation?.generation ?? 'none'}).`
          );
        }
        const installed = unwrapNativeCommand(
          await native.setNavigationUnitBoundaries(
            JSON.stringify(
              createNativeNavigationUnitBoundaryConfiguration(snapshot, currentLocation.precision)
            )
          ),
          parseNavigationBoolean
        );
        if (!installed) {
          throw new TypeError('Native navigation-unit boundaries were not installed.');
        }
        const stillInstalled =
          mountedRef.current &&
          locationEnhancementRef.current === session &&
          session.status === 'loading' &&
          chapterGranularityKeyRef.current === session.granularityKey &&
          (readyIdentityRef.current ? identitiesMatch(readyIdentityRef.current, session) : false);
        if (!stillInstalled) return null;
        session.snapshot = snapshot;
        session.status = 'ready';
        emitPendingLocations(session, snapshot);
        return snapshot;
      })
      .catch(() => {
        if (locationEnhancementRef.current === session && session.status === 'loading') {
          session.status = 'failed';
          emitPendingLocations(session);
        }
        return null;
      });
    return session;
  };

  useEffect(() => {
    const active = locationEnhancementRef.current;
    if (resolvedChapterGranularity === null) {
      if (active) {
        active.status = 'failed';
        emitPendingLocations(active);
        locationEnhancementRef.current = null;
      }
      return;
    }
    const identity = readyIdentityRef.current;
    if (identity) ensureLocationEnhancementRef.current(identity);
  }, [resolvedChapterGranularityKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const active = locationEnhancementRef.current;
      if (active) active.pending.splice(0);
      locationEnhancementRef.current = null;
      navigationHistoryRef.current = null;
      readyIdentityRef.current = null;
    };
  }, []);

  const resolvedPreferences = useMemo(() => normalizeReaderPreferences(preferences), [preferences]);
  const resolvedNavigationPolicy = useMemo(
    () => normalizeReaderNavigationPolicy(navigationPolicy),
    [navigationPolicy]
  );
  const resolvedTypographyProfile = useMemo(
    () => (typographyProfile === undefined ? null : normalizeTypographyProfile(typographyProfile)),
    [typographyProfile]
  );
  const resolvedFootnotePolicy = useMemo(
    () => normalizeFootnotePolicy(footnotePolicy),
    [footnotePolicy]
  );
  const resolvedLinkPolicy = useMemo(() => normalizeReaderLinkPolicy(linkPolicy), [linkPolicy]);
  const resolvedImagePolicy = useMemo(() => normalizeReaderImagePolicy(imagePolicy), [imagePolicy]);
  const resolvedSelectionActions = useMemo(
    () => normalizeReaderSelectionActions(selectionActions),
    [selectionActions]
  );
  const footnotePolicyJson = useMemo(
    () => JSON.stringify(resolvedFootnotePolicy),
    [resolvedFootnotePolicy]
  );
  const linkPolicyJson = useMemo(() => JSON.stringify(resolvedLinkPolicy), [resolvedLinkPolicy]);
  const imagePolicyJson = useMemo(() => JSON.stringify(resolvedImagePolicy), [resolvedImagePolicy]);
  const sourceJson = useMemo(() => {
    if (source == null) return null;
    const validated = parsePublicationSource(source);
    return JSON.stringify({
      ...(initialLocator === undefined
        ? {}
        : { initialLocator: serializeCoreRecord('locator', parseLocator(initialLocator)) }),
      navigationPolicy: resolvedNavigationPolicy,
      navigationUnitBoundaryKey: resolvedChapterGranularityKey,
      navigationUnitBoundariesRequired: resolvedChapterGranularity !== null,
      preferences: resolvedPreferences,
      selectionActions: resolvedSelectionActions,
      source: serializeCoreRecord('publicationSource', validated),
      ...(resolvedTypographyProfile === null
        ? {}
        : { typographyProfile: resolvedTypographyProfile }),
    });
  }, [
    initialLocator,
    resolvedChapterGranularityKey,
    resolvedNavigationPolicy,
    resolvedPreferences,
    resolvedSelectionActions,
    resolvedTypographyProfile,
    source,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      async search(query, options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const request = normalizeReaderSearchRequest(query, options);
        return unwrapNativeCommand(
          await native.startSearch(request.query, JSON.stringify(request.options)),
          parseReaderSearchSession
        );
      },
      async getSearchPage(sessionId, cursor) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        return unwrapNativeCommand(
          await native.getSearchPage(
            normalizeReaderSearchSessionId(sessionId),
            normalizeReaderSearchCursor(cursor)
          ),
          parseReaderSearchPage
        );
      },
      async cancelSearch(sessionId) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        unwrapNativeCommand(
          await native.cancelSearch(normalizeReaderSearchSessionId(sessionId)),
          () => undefined
        );
      },
      async clearSelection() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        unwrapNativeCommand(await native.clearSelection(), () => undefined);
      },
      async clearNavigationHistory() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const location = await readNativeCurrentLocation(native);
        const identity = location ?? readyIdentityRef.current;
        if (!identity) throw invalidNavigationInput('Navigation history is not ready.');
        const next = clearReaderNavigationHistory(historyForIdentity(identity));
        navigationHistoryRef.current = next;
        emitNavigationHistory(next);
      },
      async getCurrentLocation() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const location = await readNativeCurrentLocation(native);
        if (location === null || chapterGranularityRef.current === null) return location;
        const readyIdentity = readyIdentityRef.current;
        if (!readyIdentity || !identitiesMatch(readyIdentity, location)) return location;
        const session = ensureLocationEnhancementRef.current(location);
        if (!session) return location;
        const snapshot = session.snapshot ?? (await session.promise);
        return snapshot && identitiesMatch(snapshot, location)
          ? enrichReaderLocationEvent(location, snapshot)
          : location;
      },
      async getCurrentSelection() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        return unwrapNativeCommand(await native.getCurrentSelection(), (value) =>
          value == null ? null : parseReaderSelectionSnapshot(value)
        );
      },
      async getNavigationHistory() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const location = await readNativeCurrentLocation(native);
        const identity = location ?? readyIdentityRef.current;
        if (!identity) throw invalidNavigationInput('Navigation history is not ready.');
        return cloneReaderNavigationHistory(historyForIdentity(identity));
      },
      async getNavigationUnitContext() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const location = await readNativeCurrentLocation(native);
        if (!location) return null;
        const snapshot = await navigationSnapshotForLocation(native, location);
        return snapshot ? navigationUnitContextForLocation(location, snapshot) : null;
      },
      async getDiagnostics() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        return unwrapNativeCommand(await native.getDiagnostics(), parseReaderDiagnostics);
      },
      async getNavigationPolicy() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        return unwrapNativeCommand(
          await native.getNavigationPolicy(),
          parseReaderNavigationPolicyStatus
        );
      },
      async getNavigationUnits(granularity) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const normalizedGranularity = normalizeChapterGranularity(granularity);
        const active = locationEnhancementRef.current;
        const readyIdentity = readyIdentityRef.current;
        if (
          active &&
          readyIdentity &&
          identitiesMatch(active, readyIdentity) &&
          active.granularityKey ===
            granularityKey(normalizedGranularity, untitledResourcesRef.current)
        ) {
          const snapshot = active.snapshot ?? (await active.promise);
          if (snapshot) return snapshot;
        }
        return loadNavigationSnapshotFromNative(
          native,
          normalizedGranularity,
          untitledResourcesRef.current
        );
      },
      async getPositions(request) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const { limit, offset } = normalizePublicationPositionRequest(request);
        return unwrapNativeCommand(await native.getPositions(offset, limit), (value) =>
          parsePublicationPositionsPage(value)
        );
      },
      async getPreferences() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        return unwrapNativeCommand(await native.getPreferences(), parseReaderPreferencesStatus);
      },
      async getPublication() {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        return unwrapNativeCommand(await native.getPublication(), (value) =>
          parsePublicationInfo(value)
        );
      },
      async resolveImageSource(source, use) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const handle = readerImageSourceHandle(source);
        return unwrapNativeCommand(
          await native.resolveImageSource(handle, use),
          parseReaderResolvedImageSource
        );
      },
      async releaseImageSource(id) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
          throw new TypeError('Reader image source ID must contain 1-128 UTF-16 units.');
        }
        unwrapNativeCommand(await native.releaseImageSource(id), () => undefined);
      },
      async setDecorations(group, decorations) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const normalized = normalizeReaderDecorations(group, decorations);
        unwrapNativeCommand(
          await native.setDecorations(normalized.group, JSON.stringify(normalized.decorations)),
          () => undefined
        );
      },
      async updateDecorations(group, changes) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const normalized = normalizeReaderDecorationChanges(group, changes);
        unwrapNativeCommand(
          await native.updateDecorations(normalized.group, JSON.stringify(normalized.changes)),
          () => undefined
        );
      },
      async goBackward(options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        return performNavigationWithHistory(native, options, 'ignore', (animated) =>
          native.goBackward(animated)
        );
      },
      async goForward(options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        return performNavigationWithHistory(native, options, 'ignore', (animated) =>
          native.goForward(animated)
        );
      },
      async goBack(options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const location = await readNativeCurrentLocation(native);
        const identity = location ?? readyIdentityRef.current;
        if (!identity) return false;
        const current = historyForIdentity(identity);
        const popped = popReaderNavigationHistory(current);
        if (!popped.entry) return false;
        const animated = normalizeNavigationRequestOptions(options, 'ignore').animated;
        const moved = unwrapNativeCommand(
          await native.goToLocator(
            JSON.stringify(serializeCoreRecord('locator', popped.entry.locator)),
            animated
          ),
          parseNavigationBoolean
        );
        if (moved) {
          navigationHistoryRef.current = popped.state;
          emitNavigationHistory(popped.state);
        }
        return moved;
      },
      async goTo(target, options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const normalizedTarget = normalizeNavigationTarget(target);
        return performNavigationWithHistory(native, options, 'push', (animated) =>
          normalizedTarget.kind === 'locator'
            ? native.goToLocator(normalizedTarget.value, animated)
            : native.goToLink(normalizedTarget.value, animated)
        );
      },
      async goToPosition(position, options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const normalizedPosition = normalizeNavigationPosition(position);
        return performNavigationWithHistory(native, options, 'push', (animated) =>
          native.goToPosition(normalizedPosition, animated)
        );
      },
      async goToProgression(progression, options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const normalizedProgression = normalizeNavigationProgression(progression);
        return performNavigationWithHistory(native, options, 'push', (animated) =>
          native.goToProgression(normalizedProgression, animated)
        );
      },
      async goToNavigationUnit(id, options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        if (typeof id !== 'string' || id.length === 0) {
          throw invalidNavigationInput('Navigation-unit ID must be a non-empty string.');
        }
        const location = await readNativeCurrentLocation(native);
        if (!location) return false;
        const snapshot = await navigationSnapshotForLocation(native, location);
        const unit = snapshot?.units.find((candidate) => candidate.id === id);
        if (!unit) throw invalidNavigationInput(`Unknown navigation-unit ID ${id}.`);
        const locatorJson = JSON.stringify(serializeCoreRecord('locator', unit.startLocator));
        return performNavigationWithHistory(
          native,
          options,
          'push',
          (animated) => native.goToLocator(locatorJson, animated),
          location
        );
      },
      async goToNextNavigationUnit(options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const location = await readNativeCurrentLocation(native);
        if (!location) return false;
        const snapshot = await navigationSnapshotForLocation(native, location);
        const context = snapshot ? navigationUnitContextForLocation(location, snapshot) : null;
        if (!context?.nextNavigationUnit) return false;
        const locatorJson = JSON.stringify(
          serializeCoreRecord('locator', context.nextNavigationUnit.startLocator)
        );
        return performNavigationWithHistory(
          native,
          options,
          'ignore',
          (animated) => native.goToLocator(locatorJson, animated),
          location
        );
      },
      async goToPreviousNavigationUnit(options) {
        const native = nativeRef.current;
        if (!native) throw readerDestroyedError();
        const location = await readNativeCurrentLocation(native);
        if (!location) return false;
        const snapshot = await navigationSnapshotForLocation(native, location);
        const context = snapshot ? navigationUnitContextForLocation(location, snapshot) : null;
        if (!context?.previousNavigationUnit) return false;
        const locatorJson = JSON.stringify(
          serializeCoreRecord('locator', context.previousNavigationUnit.startLocator)
        );
        return performNavigationWithHistory(
          native,
          options,
          'ignore',
          (animated) => native.goToLocator(locatorJson, animated),
          location
        );
      },
    }),
    []
  );

  const handleReaderState = (event: NativeSyntheticEvent<ReaderState>) => {
    const state = event.nativeEvent;
    let readyHistory: ReaderNavigationHistoryState | null = null;
    if (state.state === 'ready') {
      const identity = { generation: state.generation, instanceId: state.instanceId };
      readyIdentityRef.current = identity;
      readyHistory = historyForIdentity(identity);
      ensureLocationEnhancementRef.current(identity);
    } else {
      const active = locationEnhancementRef.current;
      if (active) {
        active.status = 'failed';
        emitPendingLocations(active);
        locationEnhancementRef.current = null;
      }
      navigationHistoryRef.current = null;
      readyIdentityRef.current = null;
    }
    dispatchReaderStateEvent(state, { onError, onReady, onStateChange });
    if (readyHistory) emitNavigationHistory(readyHistory);
    qualification?.onReaderState?.(event);
  };

  const handleLocationChange = (event: NativeSyntheticEvent<unknown>) => {
    const location = parseReaderLocationEvent(event.nativeEvent);
    if (chapterGranularityRef.current === null) {
      onLocationChangeRef.current?.(location);
      return;
    }
    const readyIdentity = readyIdentityRef.current;
    if (!readyIdentity || !identitiesMatch(readyIdentity, location)) {
      onLocationChangeRef.current?.(location);
      return;
    }
    const session = ensureLocationEnhancementRef.current(location);
    if (!session || session.status === 'failed') {
      onLocationChangeRef.current?.(location);
      return;
    }
    session.resolveInitialLocation(location);
    if (session.status === 'ready' && session.snapshot) {
      onLocationChangeRef.current?.(enrichReaderLocationEvent(location, session.snapshot));
      return;
    }
    if (session.pending.length >= MAXIMUM_PENDING_LOCATION_EVENTS) {
      session.status = 'failed';
      session.pending.push(location);
      emitPendingLocations(session);
      return;
    }
    session.pending.push(location);
  };

  const handlePreferencesChange = (event: NativeSyntheticEvent<unknown>) => {
    onPreferencesChange?.(parseReaderPreferencesStatus(event.nativeEvent));
  };

  const handleNavigationPolicyChange = (event: NativeSyntheticEvent<unknown>) => {
    onNavigationPolicyChange?.(parseReaderNavigationPolicyStatus(event.nativeEvent));
  };

  const handleNavigationUnitBoundary = (event: NativeSyntheticEvent<unknown>) => {
    const session = locationEnhancementRef.current;
    if (!session?.snapshot || session.status !== 'ready') return;
    onNavigationUnitBoundary?.(
      parseNativeNavigationUnitBoundaryEvent(event.nativeEvent, session.snapshot)
    );
  };

  const handleFootnotePress = (event: NativeSyntheticEvent<unknown>) => {
    const footnote = parseFootnoteEvent(event.nativeEvent);
    let decision: 'footnote' | 'navigate' = 'footnote';
    try {
      const classified = classifyFootnoteRef.current?.(footnote);
      if (classified === 'navigate') decision = 'navigate';
    } catch {
      // Native classification is the fail-safe when a consumer classifier throws.
    }
    if (decision === 'footnote') {
      onFootnotePressRef.current?.(footnote);
      return;
    }

    (async () => {
      const native = nativeRef.current;
      const ready = readyIdentityRef.current;
      if (!native || !ready || !identitiesMatch(ready, footnote)) return;
      const current = await readNativeCurrentLocation(native);
      if (!current || !identitiesMatch(current, footnote)) return;
      const moved = unwrapNativeCommand(
        await (footnote.targetLocator === undefined
          ? native.goToLink(footnote.href, false)
          : native.goToLocator(
              JSON.stringify(serializeCoreRecord('locator', footnote.targetLocator)),
              false
            )),
        parseNavigationBoolean
      );
      if (!mountedRef.current || !moved || !identitiesMatch(readyIdentityRef.current!, footnote)) {
        if (mountedRef.current && !moved) onFootnotePressRef.current?.(footnote);
        return;
      }
      recordNavigationHistory(current);
      const link: ReaderLinkEvent = {
        ...(footnote.contentType === undefined ? {} : { contentType: footnote.contentType }),
        disposition: 'followed',
        generation: footnote.generation,
        href: footnote.href,
        instanceId: footnote.instanceId,
        kind: 'internal',
        platform: footnote.platform,
        ...(footnote.referrer === undefined ? {} : { referrer: footnote.referrer }),
        sourceLocator: footnote.sourceLocator,
        ...(footnote.targetLocator === undefined ? {} : { targetLocator: footnote.targetLocator }),
      };
      onLinkPressRef.current?.(link);
    })().catch(() => {
      if (mountedRef.current) onFootnotePressRef.current?.(footnote);
    });
  };

  const handleLinkPress = (event: NativeSyntheticEvent<unknown>) => {
    const link = parseReaderLinkEvent(event.nativeEvent);
    const historyEntry = navigationHistoryEntryFromFollowedLink(link);
    if (historyEntry) recordNavigationHistoryEntry(link, historyEntry);
    onLinkPressRef.current?.(link);
  };

  const handleSelectionAction = (event: NativeSyntheticEvent<unknown>) => {
    const selectionEvent: ReaderSelectionActionEvent = parseReaderSelectionActionEvent(
      event.nativeEvent
    );
    onSelectionAction?.(selectionEvent);
  };

  const handleSelectionChange = (event: NativeSyntheticEvent<unknown>) => {
    const selectionEvent: ReaderSelectionChangeEvent = parseReaderSelectionChangeEvent(
      event.nativeEvent
    );
    onSelectionChange?.(selectionEvent);
  };

  const handleDecorationPress = (event: NativeSyntheticEvent<unknown>) => {
    const decorationEvent: ReaderDecorationActivationEvent = parseReaderDecorationActivationEvent(
      event.nativeEvent
    );
    onDecorationPress?.(decorationEvent);
  };

  const handleImagePress = (event: NativeSyntheticEvent<unknown>) => {
    const imageEvent: ReaderImageActivationEvent = parseReaderImageActivationEvent(
      event.nativeEvent
    );
    onImagePress?.(imageEvent);
  };

  return (
    <NativeEpubReaderView
      {...viewProps}
      footnotePolicyJson={footnotePolicyJson}
      imagePolicyJson={imagePolicyJson}
      linkPolicyJson={linkPolicyJson}
      nextResourceSignal={qualification?.nextResourceSignal}
      onFootnotePress={handleFootnotePress}
      onImagePress={handleImagePress}
      onDecorationPress={handleDecorationPress}
      onLinkPress={handleLinkPress}
      onLocationChange={handleLocationChange}
      onNavigationAction={qualification?.onNavigationAction}
      onNavigationPolicyChange={handleNavigationPolicyChange}
      onNavigationUnitBoundary={handleNavigationUnitBoundary}
      onPreferencesChange={handlePreferencesChange}
      onProgress={qualification?.onProgress}
      onReaderState={handleReaderState}
      onSelectionAction={handleSelectionAction}
      onSelectionChange={handleSelectionChange}
      onTypographyDiagnostics={qualification?.onTypographyDiagnostics}
      progressProbeSignal={qualification?.progressProbeSignal}
      ref={nativeRef}
      sourceJson={sourceJson}
    />
  );
});

EpubReaderView.displayName = 'EpubReaderView';

export default EpubReaderView;
