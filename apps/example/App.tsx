import { Asset } from 'expo-asset';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import {
  EpubReaderView,
  NativeEpubKitError,
  createReaderProgressState,
  createReaderDiagnosticReport,
  readerProgressAnchorsAreMateriallyStable,
  updateReaderProgressState,
  type ChapterGranularity,
  type EpubReaderViewRef,
  type FootnoteEvent,
  type NavigationActionEvent,
  type NavigationUnitBoundaryEvent,
  type Locator,
  type NavigationUnitSnapshot,
  type PublicationSource,
  type PublicationInfo,
  type PublicationLink,
  type PublicationPositionsPage,
  type ReaderError,
  type ReaderImageActivationEvent,
  type ReaderImageUse,
  type ReaderResolvedImageSource,
  type ReaderDiagnostics,
  type ReaderDecoration,
  type ReaderDecorationActivationEvent,
  type ReaderLocationEvent,
  type ReaderLinkEvent,
  type ReaderNavigationPolicy,
  type ReaderNavigationPolicyStatus,
  type ReaderNavigationHistoryState,
  type ReaderPreferences,
  type ReaderPreferencesStatus,
  type ReaderProgressEvent,
  type ReaderProgressCheckpoint,
  type ReaderProgressControllerState,
  type ReaderProgressLocationEvent,
  type ReaderState,
  type ReaderStateChangeEvent,
  type ReaderSelectionActionEvent,
  type ReaderSelectionChangeEvent,
  type ReaderSearchPage,
  type ReaderSearchResult,
  type ReaderSearchSession,
  type TypographyDiagnostics,
  type TypographyProfile,
  type TypographyPublisherStyleMode,
} from 'native-epub-kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const minimalFixture =
  require('../../packages/testing/fixtures/generated/minimal-en.epub') as number;
const tocFixture = require('../../packages/testing/fixtures/generated/toc-complex.epub') as number;
const rtlFixture =
  require('../../packages/testing/fixtures/generated/rtl-custom-font.epub') as number;
const mixedBidiFixture =
  require('../../packages/testing/fixtures/generated/mixed-bidi.epub') as number;
const footnotesFixture =
  require('../../packages/testing/fixtures/generated/footnotes.epub') as number;
const imagesFixture = require('../../packages/testing/fixtures/generated/images.epub') as number;
const corruptFixture =
  require('../../packages/testing/fixtures/adversarial/corrupt.epub') as number;
const unsupportedFixture =
  require('../../packages/testing/fixtures/adversarial/unsupported.txt') as number;
const stressFixture =
  require('../../packages/testing/fixtures/generated/annotation-stress.epub') as number;
const fixedFixture =
  require('../../packages/testing/fixtures/generated/fixed-layout.epub') as number;
const searchFailureFixture =
  require('../../packages/testing/fixtures/generated/search-failure.epub') as number;

const showcasePreferences: ReaderPreferences = {
  fontSize: 1.4,
  layout: 'paginated',
  lineHeight: 1.8,
  pageMargins: 2.2,
  publisherStyles: false,
  readingProgression: 'rtl',
  spread: 'always',
  textAlignment: 'justify',
  theme: 'dark',
};

const typographyProfileForMode = (
  publisherStyles: TypographyPublisherStyleMode
): TypographyProfile => ({
  defaultFontFamilies: ['Lateef Qualification', 'serif'],
  publisherStyles,
  rules: [
    { direction: 'ltr', target: { kind: 'language', value: 'en' } },
    { direction: 'ltr', target: { kind: 'class', value: 'english' } },
    {
      fontFamilies: ['Lateef Qualification', 'serif'],
      lineHeight: 1.65,
      target: { kind: 'language', value: 'ar' },
    },
    {
      fontFamilies: ['Lateef Qualification', 'serif'],
      lineHeight: 1.65,
      target: { kind: 'class', value: 'arabic' },
    },
    {
      fontWeight: 700,
      target: { kind: 'class', value: 'quranic' },
    },
    {
      fontFamilies: ['Lateef Qualification', 'serif'],
      lineHeight: 1.65,
      target: { kind: 'language', value: 'ur' },
    },
    {
      fontFamilies: ['Lateef Qualification', 'serif'],
      lineHeight: 1.65,
      target: { kind: 'class', value: 'urdu' },
    },
  ],
});

type Fixture =
  | 'minimal'
  | 'toc'
  | 'rtl'
  | 'mixed'
  | 'footnotes'
  | 'images'
  | 'stress'
  | 'fixed'
  | 'searchFailure';

interface FootnoteStabilityEvent {
  current: string;
  delayMilliseconds: number;
  generation: number;
  instanceId: string;
  source: string;
  stable: boolean;
}

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
};
type SourceCase =
  'valid' | 'content' | 'remote' | 'missing' | 'corrupt' | 'unsupported' | 'unreadable' | 'closed';

interface FixtureUris extends Record<Fixture, string> {
  content?: string;
  corrupt: string;
  unsupported: string;
}

const selectionSpacesAreConsistent = (event: ReaderSelectionActionEvent) => {
  const tolerance = 1;
  const geometry = event.selection.geometry;
  if (!geometry?.viewRect || !geometry.windowRect) return false;
  const visibleViewRect = geometry.visibleViewRect ?? geometry.viewRect;
  const visibleWindowRect = geometry.visibleWindowRect ?? geometry.windowRect;
  return (
    Math.abs(
      geometry.windowRect.x - geometry.viewRect.x - (visibleWindowRect.x - visibleViewRect.x)
    ) <= tolerance &&
    Math.abs(
      geometry.windowRect.y - geometry.viewRect.y - (visibleWindowRect.y - visibleViewRect.y)
    ) <= tolerance &&
    visibleViewRect.x >= -tolerance &&
    visibleViewRect.y >= -tolerance &&
    visibleViewRect.x + visibleViewRect.width <= geometry.viewport.width + tolerance &&
    visibleViewRect.y + visibleViewRect.height <= geometry.viewport.height + tolerance
  );
};

const locatorHref = (locator: Record<string, unknown> | undefined) =>
  typeof locator?.href === 'string' ? locator.href : 'missing';

const resourceHref = (href: string) => href.split('#', 1)[0]?.replace(/^\//, '') ?? href;

const locatorsShareReadingPoint = (left: Locator, right: Locator): boolean => {
  if (resourceHref(left.href) !== resourceHref(right.href)) return false;
  const comparableNumbers: [number | undefined, number | undefined][] = [
    [left.locations?.position, right.locations?.position],
    [left.locations?.progression, right.locations?.progression],
    [left.locations?.totalProgression, right.locations?.totalProgression],
  ];
  return comparableNumbers.every(
    ([leftValue, rightValue]) =>
      leftValue === undefined ||
      rightValue === undefined ||
      (Number.isFinite(leftValue) &&
        Number.isFinite(rightValue) &&
        Math.abs(leftValue - rightValue) <= 0.005)
  );
};

const waitForNavigation = () => new Promise((resolve) => setTimeout(resolve, 320));

const stressLocator = (index: number): Locator => {
  const number = String(index).padStart(4, '0');
  return {
    href: 'EPUB/text/stress.xhtml',
    locations: { fragments: [`paragraph-${number}`] },
    text: { highlight: `Addressable paragraph ${number}.` },
    type: 'application/xhtml+xml',
  };
};

const stressDecoration = (
  index: number,
  style: ReaderDecoration['style'],
  id = `stress-${String(index).padStart(4, '0')}`
): ReaderDecoration => ({
  data: { fixture: 'annotation-stress', index },
  id,
  locator: stressLocator(index),
  style,
});

interface SearchPageChain {
  pages: ReaderSearchPage[];
  results: ReaderSearchResult[];
  truncated: boolean;
}

const requireSearchQualification = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const readSearchPageChain = async (
  commands: EpubReaderViewRef,
  session: ReaderSearchSession
): Promise<SearchPageChain> => {
  const pages: ReaderSearchPage[] = [];
  const results: ReaderSearchResult[] = [];
  const maximumPages = Math.ceil(2_000 / session.options.pageSize) + 1;
  let cursor: string | undefined = session.nextCursor;

  while (cursor !== undefined) {
    requireSearchQualification(pages.length < maximumPages, 'search page chain exceeded its bound');
    const page = await commands.getSearchPage(session.id, cursor);
    requireSearchQualification(page.cursor === cursor, 'native search cursor changed');
    requireSearchQualification(
      page.sessionId === session.id &&
        page.instanceId === session.instanceId &&
        page.generation === session.generation,
      'native search page identity changed'
    );
    requireSearchQualification(
      page.results.length <= session.options.pageSize,
      'native search page exceeded the requested size'
    );
    for (const result of page.results) {
      requireSearchQualification(
        result.index === results.length,
        'search result indexes are not contiguous'
      );
      requireSearchQualification(
        result.id === `search-result:${result.index}`,
        'search result IDs are not deterministic'
      );
      results.push(result);
    }
    requireSearchQualification(
      page.loadedResultCount === results.length,
      'search loaded-result count is incoherent'
    );
    pages.push(page);
    if (page.complete) {
      requireSearchQualification(page.nextCursor === undefined, 'complete page exposed a cursor');
      cursor = undefined;
    } else {
      requireSearchQualification(page.nextCursor !== undefined, 'incomplete page omitted a cursor');
      cursor = page.nextCursor;
    }
  }

  return {
    pages,
    results,
    truncated: pages.some((page) => page.truncated),
  };
};

const isReaderProgressLocation = (
  location: ReaderLocationEvent
): location is ReaderProgressLocationEvent =>
  location.navigationUnit !== undefined &&
  location.chapterProgress !== undefined &&
  location.overallProgress !== undefined;

interface ProgressAnchor {
  checkpoint: ReaderProgressCheckpoint;
  generation: number;
  instanceId: string;
}

const publicationTocMetrics = (publication: PublicationInfo) => {
  const hrefs: string[] = [];
  let maximumDepth = 0;
  const visit = (links: PublicationInfo['tableOfContents'], depth: number) => {
    for (const link of links) {
      maximumDepth = Math.max(maximumDepth, depth);
      hrefs.push(link.href);
      visit(link.children, depth + 1);
    }
  };
  visit(publication.tableOfContents, 0);
  return {
    duplicateCount: hrefs.length - new Set(hrefs).size,
    fragmentCount: hrefs.filter((href) => href.includes('#')).length,
    maximumDepth,
    total: hrefs.length,
  };
};

const preferenceStatusSignature = (status: ReaderPreferencesStatus) =>
  JSON.stringify({
    applied: Object.entries(status.applied).sort(([left], [right]) => left.localeCompare(right)),
    requested: Object.entries(status.requested).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
    support: [...status.support].sort((left, right) => left.name.localeCompare(right.name)),
  });

const diagnosticStageSummary = (diagnostics: ReaderDiagnostics) =>
  (['stable', 'qualification', 'planned', 'unsupported'] as const)
    .map(
      (stage) =>
        `${stage}:${diagnostics.features.filter((feature) => feature.stage === stage).length}`
    )
    .join(',');

export default function App() {
  const windowDimensions = useWindowDimensions();
  const isLandscape = windowDimensions.width > windowDimensions.height;
  const [fixtureUris, setFixtureUris] = useState<FixtureUris | null>(null);
  const [fixture, setFixture] = useState<Fixture>('minimal');
  const [typographyMode, setTypographyMode] = useState<TypographyPublisherStyleMode>('preserve');
  const [readerFocusMode, setReaderFocusMode] = useState(false);
  const [focusGestureSettlementStatus, setFocusGestureSettlementStatus] =
    useState('gesture settlement idle');
  const typographyProfile = useMemo(
    () => typographyProfileForMode(typographyMode),
    [typographyMode]
  );
  const [sourceCase, setSourceCase] = useState<SourceCase>('valid');
  const [isMounted, setIsMounted] = useState(true);
  const [readerState, setReaderState] = useState<ReaderState | null>(null);
  const [stableState, setStableState] = useState<ReaderStateChangeEvent | null>(null);
  const [stableError, setStableError] = useState<ReaderError | null>(null);
  const [stableLocation, setStableLocation] = useState<ReaderLocationEvent | null>(null);
  const [readerProgressState, setReaderProgressState] =
    useState<ReaderProgressControllerState | null>(null);
  const [readerProgressAnchorStatus, setReaderProgressAnchorStatus] = useState(
    'progress anchor not checked'
  );
  const [navigationPolicy, setNavigationPolicy] = useState<ReaderNavigationPolicy>({});
  const [navigationPolicyStatus, setNavigationPolicyStatus] =
    useState<ReaderNavigationPolicyStatus | null>(null);
  const [navigationPolicyCommandStatus, setNavigationPolicyCommandStatus] = useState(
    'policy command not checked'
  );
  const [gestureMatrixStatus, setGestureMatrixStatus] = useState('gesture anchor not checked');
  const [publicationInfo, setPublicationInfo] = useState<PublicationInfo | null>(null);
  const [positionsPage, setPositionsPage] = useState<PublicationPositionsPage | null>(null);
  const [positionPageChainIsValid, setPositionPageChainIsValid] = useState(false);
  const [publicationBridgeMilliseconds, setPublicationBridgeMilliseconds] = useState<number | null>(
    null
  );
  const [publicationDataError, setPublicationDataError] = useState<string | null>(null);
  const [stableCommandStatus, setStableCommandStatus] = useState<
    'pending' | 'location' | 'selection' | 'not-ready' | 'destroyed' | 'error'
  >('pending');
  const [selectionAction, setSelectionAction] = useState<ReaderSelectionActionEvent | null>(null);
  const [selectionChange, setSelectionChange] = useState<ReaderSelectionChangeEvent | null>(null);
  const [decorationActivation, setDecorationActivation] =
    useState<ReaderDecorationActivationEvent | null>(null);
  const [decorationActivationCount, setDecorationActivationCount] = useState(0);
  const [decorationStatus, setDecorationStatus] = useState('Decoration matrix pending');
  const [searchStatus, setSearchStatus] = useState('Search matrix pending');
  const [footnote, setFootnote] = useState<FootnoteEvent | null>(null);
  const [footnoteStability, setFootnoteStability] = useState<FootnoteStabilityEvent | null>(null);
  const [linkAction, setLinkAction] = useState<ReaderLinkEvent | null>(null);
  const [imageAction, setImageAction] = useState<ReaderImageActivationEvent | null>(null);
  const [resolvedImage, setResolvedImage] = useState<ReaderResolvedImageSource | null>(null);
  const [imageSharingAllowed, setImageSharingAllowed] = useState(false);
  const [imageStatus, setImageStatus] = useState('Image activation pending');
  const [navigationAction, setNavigationAction] = useState<NavigationActionEvent | null>(null);
  const [navigationStatus, setNavigationStatus] = useState('Navigation matrix pending');
  const [navigationUnitError, setNavigationUnitError] = useState<string | null>(null);
  const [navigationUnitSnapshot, setNavigationUnitSnapshot] =
    useState<NavigationUnitSnapshot | null>(null);
  const [navigationBoundaryEvent, setNavigationBoundaryEvent] =
    useState<NavigationUnitBoundaryEvent | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<ReaderNavigationHistoryState | null>(
    null
  );
  const [navigationBoundaryStatus, setNavigationBoundaryStatus] = useState(
    'Boundary/history matrix pending'
  );
  const [restoreLocator, setRestoreLocator] = useState<Locator | undefined>();
  const [progress, setProgress] = useState<ReaderProgressEvent | null>(null);
  const [progressBaseline, setProgressBaseline] = useState<ReaderProgressEvent | null>(null);
  const [nextResourceSignal, setNextResourceSignal] = useState(0);
  const [progressProbeSignal, setProgressProbeSignal] = useState(0);
  const [preferences, setPreferences] = useState<ReaderPreferences>({});
  const [preferencesStatus, setPreferencesStatus] = useState<ReaderPreferencesStatus | null>(null);
  const [preferencesPanelVisible, setPreferencesPanelVisible] = useState(false);
  const [preferenceAnchorStatus, setPreferenceAnchorStatus] = useState('anchor not checked');
  const [preferenceCommandStatus, setPreferenceCommandStatus] = useState('command not checked');
  const [readerDiagnostics, setReaderDiagnostics] = useState<ReaderDiagnostics | null>(null);
  const [diagnosticReport, setDiagnosticReport] = useState('');
  const [diagnosticStatus, setDiagnosticStatus] = useState('Issue report not requested');
  const [typographyDiagnostics, setTypographyDiagnostics] = useState<TypographyDiagnostics | null>(
    null
  );
  const [typographyAnchorStatus, setTypographyAnchorStatus] = useState(
    'typography anchor not checked'
  );
  const [typographyProgressionStatus, setTypographyProgressionStatus] = useState(
    'typography progression not checked'
  );
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [assetError, setAssetError] = useState<string | null>(null);
  const readerRef = useRef<EpubReaderViewRef | null>(null);
  const retainedReaderRef = useRef<EpubReaderViewRef | null>(null);
  const stableCallbackOrder = useRef<string[]>([]);
  const preferenceAnchorRef = useRef<ReaderLocationEvent | null>(null);
  const typographyAnchorRef = useRef<ReaderLocationEvent | null>(null);
  const typographyProgressionRef = useRef<'ltr' | 'rtl' | null>(null);
  const readerProgressAnchorRef = useRef<ProgressAnchor | null>(null);
  const gestureAnchorRef = useRef<ReaderLocationEvent | null>(null);

  useEffect(() => {
    let active = true;

    Asset.loadAsync([
      minimalFixture,
      tocFixture,
      rtlFixture,
      mixedBidiFixture,
      footnotesFixture,
      imagesFixture,
      stressFixture,
      fixedFixture,
      searchFailureFixture,
      corruptFixture,
      unsupportedFixture,
    ])
      .then(
        async ([
          minimal,
          toc,
          rtl,
          mixed,
          footnotes,
          images,
          stress,
          fixed,
          searchFailure,
          corrupt,
          unsupported,
        ]) => {
          if (!active) return;
          if (
            !minimal ||
            !toc ||
            !rtl ||
            !mixed ||
            !footnotes ||
            !images ||
            !stress ||
            !fixed ||
            !searchFailure ||
            !corrupt ||
            !unsupported
          ) {
            throw new Error('Fixture assets did not load.');
          }

          const minimalUri = minimal.localUri ?? minimal.uri;
          const content =
            Platform.OS === 'android' ? await getContentUriAsync(minimalUri) : undefined;
          setFixtureUris({
            minimal: minimalUri,
            toc: toc.localUri ?? toc.uri,
            rtl: rtl.localUri ?? rtl.uri,
            mixed: mixed.localUri ?? mixed.uri,
            footnotes: footnotes.localUri ?? footnotes.uri,
            images: images.localUri ?? images.uri,
            stress: stress.localUri ?? stress.uri,
            fixed: fixed.localUri ?? fixed.uri,
            searchFailure: searchFailure.localUri ?? searchFailure.uri,
            corrupt: corrupt.localUri ?? corrupt.uri,
            unsupported: unsupported.localUri ?? unsupported.uri,
            ...(content ? { content } : {}),
          });
        }
      )
      .catch((error: unknown) => {
        if (active) {
          setAssetError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const source: PublicationSource | null | undefined = (() => {
    if (!fixtureUris) return undefined;
    switch (sourceCase) {
      case 'valid':
        return { kind: 'file', uri: fixtureUris[fixture] };
      case 'content':
        return {
          kind: 'content',
          uri: fixtureUris.content ?? 'content://native-epub-kit/unavailable',
        };
      case 'remote':
        return { kind: 'remote', url: 'https://example.invalid/native-epub-kit.epub' };
      case 'missing':
        return {
          kind: 'file',
          uri: new ExpoFile(Paths.document, 'native-epub-kit-missing.epub').uri,
        };
      case 'corrupt':
        return { kind: 'file', uri: fixtureUris.corrupt };
      case 'unsupported':
        return { kind: 'file', uri: fixtureUris.unsupported };
      case 'unreadable':
        return {
          kind: 'file',
          uri: new ExpoFile(Paths.document, 'native-epub-kit-unreadable.epub').uri,
        };
      case 'closed':
        return null;
    }
  })();

  const stateKey = readerState
    ? `${readerState.platform}:${readerState.instanceId}:${readerState.generation}:${readerState.state}`
    : null;
  const emissionCount = stateKey ? (eventCounts[stateKey] ?? 0) : 0;
  const stableOwnsQualificationState =
    stableState !== null &&
    readerState !== null &&
    stableState.instanceId === readerState.instanceId &&
    stableState.generation === readerState.generation;
  const displayedState = stableOwnsQualificationState ? stableState.state : readerState?.state;
  const displayedError = displayedState === 'error' ? (stableState?.error ?? stableError) : null;

  const handleFootnotePress = (nextFootnote: FootnoteEvent) => {
    setFootnote(nextFootnote);
    setFootnoteStability(null);
    setLinkAction(null);
    const delayMilliseconds = 350;
    setTimeout(() => {
      readerRef.current
        ?.getCurrentLocation()
        .then((current) => {
          if (
            !current ||
            current.instanceId !== nextFootnote.instanceId ||
            current.generation !== nextFootnote.generation
          ) {
            return;
          }
          setFootnoteStability({
            current: canonicalJson(current.locator),
            delayMilliseconds,
            generation: nextFootnote.generation,
            instanceId: nextFootnote.instanceId,
            source: canonicalJson(nextFootnote.sourceLocator),
            stable: locatorsShareReadingPoint(current.locator, nextFootnote.sourceLocator),
          });
        })
        .catch(() => undefined);
    }, delayMilliseconds);
  };

  const handleReaderState = (nextState: ReaderState) => {
    const key = `${nextState.platform}:${nextState.instanceId}:${nextState.generation}:${nextState.state}`;
    if (nextState.state === 'opening') setSearchStatus('Search matrix pending');
    setEventCounts((counts) => ({ ...counts, [key]: (counts[key] ?? 0) + 1 }));
    setSelectionAction((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setSelectionChange((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setDecorationActivation((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setFootnote((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setFootnoteStability((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setLinkAction((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setNavigationAction((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setProgress((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setProgressBaseline((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setPublicationInfo((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setPositionsPage((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setNavigationUnitSnapshot((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setPreferencesStatus((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setNavigationPolicyStatus((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    setReaderProgressState((current) =>
      current &&
      (current.instanceId !== nextState.instanceId || current.generation !== nextState.generation)
        ? null
        : current
    );
    const progressAnchor = readerProgressAnchorRef.current;
    if (
      progressAnchor &&
      (progressAnchor.instanceId !== nextState.instanceId ||
        progressAnchor.generation !== nextState.generation)
    ) {
      readerProgressAnchorRef.current = null;
      setReaderProgressAnchorStatus('progress anchor reset');
    }
    setReaderState(nextState);
  };

  const loadPublicationData = async () => {
    const commands = readerRef.current;
    if (!commands) return;
    const startedAt = performance.now();
    setPublicationDataError(null);
    try {
      const [info, firstPage] = await Promise.all([
        commands.getPublication(),
        commands.getPositions({ limit: 10_000 }),
      ]);
      const nextPage =
        firstPage.nextOffset === undefined
          ? null
          : await commands.getPositions({ limit: 10_000, offset: firstPage.nextOffset });
      const identityIsCoherent =
        info.instanceId === firstPage.instanceId &&
        info.generation === firstPage.generation &&
        (nextPage === null ||
          (nextPage.instanceId === info.instanceId &&
            nextPage.generation === info.generation &&
            nextPage.offset === firstPage.nextOffset));
      setPublicationInfo(info);
      setPositionsPage(firstPage);
      setPositionPageChainIsValid(identityIsCoherent);
      setPublicationBridgeMilliseconds(Math.round(performance.now() - startedAt));
    } catch (error: unknown) {
      setPublicationDataError(
        error instanceof NativeEpubKitError
          ? error.code
          : error instanceof Error
            ? error.message
            : 'error'
      );
    }
  };

  const handleStableState = (nextState: ReaderStateChangeEvent) => {
    stableCallbackOrder.current.push(`state:${nextState.state}:${nextState.sequence}`);
    if (stableCallbackOrder.current.length > 12) stableCallbackOrder.current.shift();
    setStableState(nextState);
  };

  const runLocationCommand = () => {
    setProgressProbeSignal((signal) => signal + 1);
    const commands = retainedReaderRef.current;
    if (!commands) {
      setStableCommandStatus('destroyed');
      return;
    }
    commands
      .getCurrentLocation()
      .then((location) => {
        const matchesLastEvent =
          location !== null &&
          stableLocation !== null &&
          location.instanceId === stableLocation.instanceId &&
          location.generation === stableLocation.generation &&
          location.sequence === stableLocation.sequence;
        const readyStateIndex = stableCallbackOrder.current.findLastIndex((entry) =>
          entry.startsWith('state:ready:')
        );
        const readySequence = stableCallbackOrder.current[readyStateIndex]?.split(':').at(-1);
        const readyOrderIsValid =
          readyStateIndex >= 0 &&
          stableCallbackOrder.current[readyStateIndex + 1] === `ready:${readySequence}` &&
          stableCallbackOrder.current
            .slice(readyStateIndex + 2)
            .some((entry) => entry.startsWith('location:'));
        setStableCommandStatus(
          location && matchesLastEvent && readyOrderIsValid ? 'location' : 'pending'
        );
      })
      .catch((error: unknown) => {
        setStableCommandStatus(
          error instanceof NativeEpubKitError
            ? error.code === 'READER_NOT_READY'
              ? 'not-ready'
              : error.code === 'READER_DESTROYED'
                ? 'destroyed'
                : 'error'
            : 'error'
        );
      });
  };

  const decorationFailure = (error: unknown) =>
    error instanceof NativeEpubKitError
      ? `${error.code}:${error.message}`
      : error instanceof Error
        ? error.message
        : 'unexpected error';

  const resolveActivatedImage = async (use: ReaderImageUse) => {
    const commands = readerRef.current;
    if (!commands || !imageAction) {
      setImageStatus(`${use} unavailable · activate the fixture image first`);
      return;
    }
    try {
      if (resolvedImage) {
        await commands.releaseImageSource(resolvedImage.id);
        setResolvedImage(null);
      }
      const resolved = await commands.resolveImageSource(imageAction.source, use);
      setResolvedImage(resolved);
      setImageStatus(
        `${use} resolved · ${resolved.contentType} · ${resolved.byteLength} bytes · local file yes`
      );
    } catch (error: unknown) {
      setImageStatus(`${use} rejected · ${decorationFailure(error)}`);
    }
  };

  const releaseResolvedImage = async () => {
    const commands = readerRef.current;
    if (!commands || !resolvedImage) {
      setImageStatus('release unavailable · no materialized image');
      return;
    }
    const id = resolvedImage.id;
    try {
      await commands.releaseImageSource(id);
      setResolvedImage(null);
      setImageStatus(`released · ${id}`);
    } catch (error: unknown) {
      setImageStatus(`release rejected · ${decorationFailure(error)}`);
    }
  };

  const runDecorationCoexistenceMatrix = async () => {
    const commands = readerRef.current;
    if (!commands || fixture !== 'stress') {
      setDecorationStatus('Decoration matrix unavailable · select Large positions');
      return;
    }
    setDecorationStatus('Decoration matrix running');
    setDecorationActivation(null);
    setDecorationActivationCount(0);
    const startedAt = performance.now();
    try {
      await commands.setDecorations('annotations', [
        stressDecoration(1, { tint: '#e8c97a', type: 'highlight' }, 'annotation-highlight'),
        stressDecoration(
          2,
          { asset: 'note', tint: '#d4907a', type: 'margin-icon' },
          'annotation-note'
        ),
      ]);
      await commands.setDecorations('search.results:v1', [
        stressDecoration(3, { tint: '#8eb8cc', type: 'underline' }, 'search-result-1'),
        stressDecoration(4, { tint: '#8eb8cc99', type: 'highlight' }, 'search-result-2'),
      ]);
      await commands.setDecorations('transient.current', [
        stressDecoration(
          5,
          {
            config: {
              borderRadius: 6,
              borderWidth: 2,
              fillOpacity: 0.18,
              isActive: true,
              tint: '#9b7bb8',
            },
            template: 'rounded-box-v1',
            type: 'custom',
          },
          'transient-current'
        ),
      ]);
      await commands.updateDecorations('annotations', [
        {
          decoration: stressDecoration(
            1,
            { isActive: true, tint: '#e8c97a', type: 'underline' },
            'annotation-highlight'
          ),
          type: 'update',
        },
        {
          decoration: stressDecoration(
            6,
            { asset: 'bookmark', tint: '#64748b', type: 'margin-icon' },
            'annotation-bookmark'
          ),
          type: 'add',
        },
        { id: 'annotation-note', type: 'remove' },
      ]);
      const moved = await commands.goTo(stressLocator(1), { animated: false });
      await waitForNavigation();
      const current = await commands.getCurrentLocation();
      setDecorationStatus(
        `Decoration matrix passed · groups 3 · styles 4 · delta 3 · navigation ${moved && resourceHref(current?.locator.href ?? '').endsWith('text/stress.xhtml') ? 'usable' : 'unverified'} · ${Math.round(performance.now() - startedAt)} ms`
      );
    } catch (error: unknown) {
      setDecorationStatus(`Decoration matrix failed · ${decorationFailure(error)}`);
    }
  };

  const runDecorationStressMatrix = async () => {
    const commands = readerRef.current;
    if (!commands || fixture !== 'stress') {
      setDecorationStatus('2,000-decoration matrix unavailable · select Large positions');
      return;
    }
    setDecorationStatus('2,000-decoration matrix running');
    const startedAt = performance.now();
    try {
      const decorations = Array.from({ length: 2_000 }, (_, index) =>
        stressDecoration(index + 1, {
          tint: index % 2 === 0 ? '#e8c97a99' : '#8eb8cc99',
          type: index % 5 === 0 ? 'underline' : 'highlight',
        })
      );
      await commands.setDecorations('stress.annotations', decorations);
      const renderedAt = performance.now();
      const movedToEnd = await commands.goTo(stressLocator(2_000), { animated: false });
      await waitForNavigation();
      const end = await commands.getCurrentLocation();
      const movedToStart = await commands.goTo(stressLocator(1), { animated: false });
      await waitForNavigation();
      const start = await commands.getCurrentLocation();
      const navigationUsable =
        movedToEnd &&
        movedToStart &&
        resourceHref(end?.locator.href ?? '').endsWith('text/stress.xhtml') &&
        resourceHref(start?.locator.href ?? '').endsWith('text/stress.xhtml');
      const completedAt = performance.now();
      await commands.setDecorations('stress.annotations', []);
      const cleanedAt = performance.now();
      setDecorationStatus(
        `2,000-decoration matrix passed · render ${Math.round(renderedAt - startedAt)} ms · navigation ${navigationUsable ? 'usable' : 'unverified'} · total ${Math.round(completedAt - startedAt)} ms · cleanup ${Math.round(cleanedAt - completedAt)} ms`
      );
    } catch (error: unknown) {
      setDecorationStatus(`2,000-decoration matrix failed · ${decorationFailure(error)}`);
    }
  };

  const clearDecorationMatrix = async () => {
    const commands = readerRef.current;
    if (!commands) return;
    setDecorationStatus('Clearing decoration groups');
    try {
      for (const group of [
        'annotations',
        'search.results:v1',
        'transient.current',
        'stress.annotations',
      ]) {
        await commands.setDecorations(group, []);
      }
      setDecorationActivation(null);
      setDecorationActivationCount(0);
      setDecorationStatus('Decoration groups cleared');
    } catch (error: unknown) {
      setDecorationStatus(`Decoration clear failed · ${decorationFailure(error)}`);
    }
  };

  const isExpectedSearchFailure = (error: unknown): boolean =>
    error instanceof NativeEpubKitError &&
    error.code === 'SEARCH_FAILED' &&
    error.phase === 'search';

  const runLargeSearchMatrix = async (commands: EpubReaderViewRef): Promise<string> => {
    const startedAt = performance.now();
    const session = await commands.search('Addressable paragraph', { pageSize: 100 });
    const chain = await readSearchPageChain(commands, session);
    requireSearchQualification(
      chain.results.length === 2_000,
      'large search did not stop at 2,000'
    );
    requireSearchQualification(chain.truncated, 'large search did not report truncation');
    requireSearchQualification(chain.pages.length === 20, 'large search page count is unexpected');
    requireSearchQualification(
      chain.results.every(
        (result) =>
          result.excerpt.highlight.length > 0 &&
          result.excerpt.highlight.length <= 256 &&
          result.excerpt.before.length <= 256 &&
          result.excerpt.after.length <= 256
      ),
      'large search returned an invalid excerpt'
    );

    await commands.setDecorations('annotations', [
      stressDecoration(1, { tint: '#e8c97a99', type: 'highlight' }, 'search-isolation-annotation'),
    ]);
    await commands.setDecorations(
      session.decorationGroups.results,
      chain.results.slice(0, 12).map((result) => ({
        data: { index: result.index, source: 'search' },
        id: result.id,
        locator: result.locator,
        style: { tint: '#8eb8cc', type: 'underline' },
      }))
    );
    await commands.setDecorations(session.decorationGroups.current, [
      {
        data: { index: chain.results[0]!.index, source: 'search-current' },
        id: 'search-current:0',
        locator: chain.results[0]!.locator,
        style: { isActive: true, tint: '#9b7bb899', type: 'highlight' },
      },
    ]);

    await commands.clearNavigationHistory();
    const navigationTarget = chain.results[1_500]!;
    const moved = await commands.goTo(navigationTarget.locator, { animated: false });
    await waitForNavigation();
    const atResult = await commands.getCurrentLocation();
    const returned = await commands.goBack({ animated: false });
    await waitForNavigation();
    const afterBack = await commands.getCurrentLocation();
    requireSearchQualification(
      moved && atResult !== null && returned && afterBack !== null,
      'search-result navigation or back navigation failed'
    );

    const cancellable = await commands.search('Selection geometry', { pageSize: 100 });
    const pendingPage = commands.getSearchPage(cancellable.id, cancellable.nextCursor);
    const replacementPromise = commands.search('Position tokens', { pageSize: 10 });
    const [pendingOutcome, replacementOutcome] = await Promise.allSettled([
      pendingPage,
      replacementPromise,
    ]);
    if (replacementOutcome.status === 'rejected') throw replacementOutcome.reason;
    const staleCursor =
      pendingOutcome.status === 'fulfilled'
        ? (pendingOutcome.value.nextCursor ?? cancellable.nextCursor)
        : cancellable.nextCursor;
    let staleRejected = false;
    try {
      await commands.getSearchPage(cancellable.id, staleCursor);
    } catch (error: unknown) {
      staleRejected = isExpectedSearchFailure(error);
    }
    requireSearchQualification(staleRejected, 'replaced search session remained consumable');
    await commands.cancelSearch(replacementOutcome.value.id);
    await commands.cancelSearch(replacementOutcome.value.id);

    await commands.setDecorations(session.decorationGroups.results, []);
    await commands.setDecorations(session.decorationGroups.current, []);
    await commands.setDecorations('annotations', []);

    return `large passed · 2,000/2,048 · pages ${chain.pages.length} · truncated yes · groups isolated · navigation/back yes · in-flight ${pendingOutcome.status === 'rejected' ? 'cancelled' : 'completed-before-replace'} · stale rejected · cancel idempotent · ${Math.round(performance.now() - startedAt)} ms`;
  };

  const runRtlSearchMatrix = async (commands: EpubReaderViewRef): Promise<string> => {
    const session = await commands.search('اردو', { language: 'ur', pageSize: 7 });
    const chain = await readSearchPageChain(commands, session);
    requireSearchQualification(chain.results.length > 0, 'RTL search returned no results');
    requireSearchQualification(!chain.truncated, 'RTL search unexpectedly truncated');
    requireSearchQualification(
      chain.results.every(
        (result) => result.locator.href.length > 0 && result.excerpt.highlight.includes('اردو')
      ),
      'RTL search returned invalid locators or highlights'
    );
    const resourceCount = new Set(chain.results.map((result) => resourceHref(result.locator.href)))
      .size;
    await commands.cancelSearch(session.id);
    return `RTL passed · results ${chain.results.length} · pages ${chain.pages.length} · resources ${resourceCount} · language ur · excerpts bounded`;
  };

  const runEmptyAndCursorSearchMatrix = async (commands: EpubReaderViewRef): Promise<string> => {
    const emptySession = await commands.search('absent-search-token-9f32c1', { pageSize: 5 });
    const emptyChain = await readSearchPageChain(commands, emptySession);
    requireSearchQualification(
      emptyChain.results.length === 0 &&
        emptyChain.pages.length === 1 &&
        emptyChain.pages[0]?.complete === true &&
        !emptyChain.truncated,
      'empty search did not return one complete empty page'
    );
    let emptyReplayRejected = false;
    try {
      await commands.getSearchPage(emptySession.id, emptySession.nextCursor);
    } catch (error: unknown) {
      emptyReplayRejected = isExpectedSearchFailure(error);
    }
    requireSearchQualification(emptyReplayRejected, 'terminal empty cursor was replayable');

    const repeatedSession = await commands.search('fixture', { pageSize: 1 });
    await commands.getSearchPage(repeatedSession.id, repeatedSession.nextCursor);
    let repeatedRejected = false;
    try {
      await commands.getSearchPage(repeatedSession.id, repeatedSession.nextCursor);
    } catch (error: unknown) {
      repeatedRejected = isExpectedSearchFailure(error);
    }
    requireSearchQualification(repeatedRejected, 'consumed search cursor was replayable');
    await commands.cancelSearch(repeatedSession.id);
    await commands.cancelSearch(repeatedSession.id);
    return 'empty/repeated passed · one empty terminal page · terminal replay rejected · consumed cursor rejected · cancel idempotent';
  };

  const runFailedSearchMatrix = async (commands: EpubReaderViewRef): Promise<string> => {
    let failedSafely = false;
    try {
      const session = await commands.search('absent-runtime-failure-token-52c6', { pageSize: 10 });
      await commands.getSearchPage(session.id, session.nextCursor);
    } catch (error: unknown) {
      failedSafely = isExpectedSearchFailure(error);
    }
    requireSearchQualification(
      failedSafely,
      'missing search resource did not map to SEARCH_FAILED'
    );
    return 'failed-search passed · missing reading resource mapped to recoverable SEARCH_FAILED/search';
  };

  const runSearchMatrix = async () => {
    const commands = readerRef.current;
    if (!commands) {
      setSearchStatus('Search matrix unavailable · reader not ready');
      return;
    }
    setSearchStatus(`Search ${fixture} matrix running`);
    try {
      const status =
        fixture === 'stress'
          ? await runLargeSearchMatrix(commands)
          : fixture === 'rtl'
            ? await runRtlSearchMatrix(commands)
            : fixture === 'searchFailure'
              ? await runFailedSearchMatrix(commands)
              : await runEmptyAndCursorSearchMatrix(commands);
      setSearchStatus(`Search ${status}`);
    } catch (error: unknown) {
      setSearchStatus(`Search ${fixture} failed · ${decorationFailure(error)}`);
    }
  };

  const handleProgress = (nextProgress: ReaderProgressEvent) => {
    setProgressBaseline((current) =>
      current &&
      current.instanceId === nextProgress.instanceId &&
      current.generation === nextProgress.generation
        ? current
        : nextProgress
    );
    setProgress(nextProgress);
  };

  const progressHref = locatorHref(progress?.locator);
  const baselineHref = locatorHref(progressBaseline?.locator);
  const progressOwnsBaseline =
    progress !== null &&
    progressBaseline !== null &&
    progress.instanceId === progressBaseline.instanceId &&
    progress.generation === progressBaseline.generation;
  const progressStayedInResource = progressOwnsBaseline && progressHref === baselineHref;
  const verticalProgressAdvanced =
    progressStayedInResource &&
    progress !== null &&
    progressBaseline !== null &&
    progress.resourceProgress > progressBaseline.resourceProgress + 0.01;
  const tocMetrics = publicationInfo ? publicationTocMetrics(publicationInfo) : null;
  const mappingMilliseconds = publicationInfo?.capabilities.mappingDurationMilliseconds;

  const currentCommandLocation = async () => {
    await waitForNavigation();
    return readerRef.current?.getCurrentLocation() ?? null;
  };

  const runNavigationMatrix = async () => {
    const commands = readerRef.current;
    const info = publicationInfo;
    const page = positionsPage;
    if (!commands || !info || !page || page.positions.length < 2) {
      setNavigationStatus('Navigation matrix unavailable');
      return;
    }
    setNavigationStatus('Navigation matrix running');
    try {
      let passed = 0;
      const checks: string[] = [];
      const positionMoved = await commands.goToPosition(2);
      const positionLocation = await currentCommandLocation();
      const positionPassed = positionMoved && positionLocation?.position === 2;
      if (positionPassed) passed += 1;
      checks.push(`p${positionPassed ? 1 : 0}:${positionLocation?.position ?? 'n'}`);

      const locatorTarget = page.positions[1]!;
      const locatorMoved = await commands.goTo(locatorTarget);
      const locatorLocation = await currentCommandLocation();
      const locatorPassed =
        locatorMoved &&
        locatorLocation !== null &&
        resourceHref(locatorLocation.locator.href) === resourceHref(locatorTarget.href);
      if (locatorPassed) passed += 1;
      checks.push(`l${locatorPassed ? 1 : 0}`);

      const flattenLinks = (links: PublicationInfo['tableOfContents']): PublicationLink[] =>
        links.flatMap((link) => [link, ...flattenLinks(link.children)]);
      const linkTarget = flattenLinks(info.tableOfContents).at(-1) ?? info.readingOrder.at(-1);
      if (!linkTarget) throw new Error('The fixture has no navigation link.');
      const linkMoved = await commands.goTo(linkTarget);
      const linkLocation = await currentCommandLocation();
      const linkPassed =
        linkMoved &&
        linkLocation !== null &&
        resourceHref(linkLocation.locator.href) === resourceHref(linkTarget.href);
      if (linkPassed) passed += 1;
      checks.push(`k${linkPassed ? 1 : 0}`);

      const progressionMoved = await commands.goToProgression(0.5);
      const progressionLocation = await currentCommandLocation();
      const locatedProgression = progressionLocation?.locator.locations?.totalProgression;
      const progressionPassed =
        progressionMoved &&
        typeof locatedProgression === 'number' &&
        Math.abs(locatedProgression - 0.5) <= 0.15;
      if (progressionPassed) passed += 1;
      checks.push(`g${progressionPassed ? 1 : 0}:${locatedProgression?.toFixed(2) ?? 'n'}`);

      await commands.goToPosition(1);
      await currentCommandLocation();
      const forwardPassed = await commands.goForward();
      if (forwardPassed) passed += 1;
      checks.push(`f${forwardPassed ? 1 : 0}`);
      await currentCommandLocation();
      const backwardPassed = await commands.goBackward();
      if (backwardPassed) passed += 1;
      checks.push(`b${backwardPassed ? 1 : 0}`);
      const finalLocation = await currentCommandLocation();
      setNavigationStatus(
        `matrix ${passed}/6 ${checks.join(',')} · ${finalLocation?.locator.href ?? 'missing'} · ${finalLocation?.reason ?? 'missing'}`
      );
    } catch (error: unknown) {
      setNavigationStatus(
        `matrix error ${error instanceof NativeEpubKitError ? error.code : error instanceof Error ? error.message : 'unknown'}`
      );
    }
  };

  const inspectNavigationUnits = async (granularity: ChapterGranularity) => {
    const commands = readerRef.current;
    const label =
      typeof granularity === 'string' ? granularity : `depth-${granularity.depth.toString()}`;
    if (!commands) {
      setNavigationUnitError(`${label} unavailable`);
      return;
    }
    setNavigationUnitError(`${label} loading`);
    try {
      const snapshot = await commands.getNavigationUnits(granularity);
      setNavigationUnitSnapshot(snapshot);
      setNavigationUnitError(null);
    } catch (error: unknown) {
      setNavigationUnitError(
        `${label} error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const runNavigationBoundaryMatrix = async () => {
    const commands = readerRef.current;
    if (!commands) {
      setNavigationBoundaryStatus('Boundary/history matrix unavailable');
      return;
    }
    setNavigationBoundaryStatus('Boundary/history matrix running');
    try {
      const snapshot = await commands.getNavigationUnits('top-level');
      const first = snapshot.units[0];
      const second = snapshot.units[1];
      const flattenLinks = (links: PublicationInfo['tableOfContents']): PublicationLink[] =>
        links.flatMap((link) => [link, ...flattenLinks(link.children)]);
      const tocTarget = publicationInfo
        ? flattenLinks(publicationInfo.tableOfContents).at(-1)
        : undefined;
      if (!first || !second || !tocTarget) {
        setNavigationBoundaryStatus('Boundary/history matrix needs two units and a TOC');
        return;
      }

      await commands.clearNavigationHistory();
      const firstMoved = await commands.goToNavigationUnit(first.id, {
        animated: false,
        history: 'ignore',
      });
      await waitForNavigation();
      const firstContext = await commands.getNavigationUnitContext();
      const nextMoved = await commands.goToNextNavigationUnit({ animated: false });
      await waitForNavigation();
      const nextContext = await commands.getNavigationUnitContext();
      const previousMoved = await commands.goToPreviousNavigationUnit({ animated: false });
      await waitForNavigation();
      const returnedContext = await commands.getNavigationUnitContext();
      const linkMoved = await commands.goTo(tocTarget, { animated: false });
      await waitForNavigation();
      const historyAfterLink = await commands.getNavigationHistory();
      const backMoved = await commands.goBack({ animated: false });
      await waitForNavigation();
      const afterBack = await commands.getNavigationUnitContext();
      await commands.clearNavigationHistory();
      const clearedHistory = await commands.getNavigationHistory();

      const checks = [
        firstMoved && firstContext?.navigationUnit.id === first.id,
        nextMoved && nextContext?.navigationUnit.id === second.id,
        previousMoved && returnedContext?.navigationUnit.id === first.id,
        linkMoved,
        historyAfterLink.entries.length === 1 && historyAfterLink.canGoBack,
        backMoved && afterBack?.navigationUnit.id === first.id,
        clearedHistory.entries.length === 0 && !clearedHistory.canGoBack,
      ];
      const passed = checks.filter(Boolean).length;
      setNavigationUnitSnapshot(snapshot);
      setNavigationBoundaryStatus(
        `boundary/history ${passed}/7 · first ${firstContext?.navigationUnit.title ?? 'missing'} · next ${nextContext?.navigationUnit.title ?? 'missing'} · return ${afterBack?.navigationUnit.title ?? 'missing'} · history ${historyAfterLink.entries.length}→${clearedHistory.entries.length}`
      );
    } catch (error: unknown) {
      setNavigationBoundaryStatus(
        `boundary/history error ${error instanceof NativeEpubKitError ? error.code : error instanceof Error ? error.message : 'unknown'}`
      );
    }
  };

  const probeReaderProgressAnchor = async () => {
    const commands = readerRef.current;
    if (!commands) {
      setReaderProgressAnchorStatus('progress unavailable');
      return;
    }
    try {
      const location = await commands.getCurrentLocation();
      if (!location || !isReaderProgressLocation(location)) {
        setReaderProgressAnchorStatus('progress raw fallback');
        return;
      }
      setReaderProgressState((current) =>
        updateReaderProgressState(current ?? undefined, location)
      );
      const checkpoint = createReaderProgressState(location).current;
      const anchor = readerProgressAnchorRef.current;
      if (
        !anchor ||
        anchor.instanceId !== location.instanceId ||
        anchor.generation !== location.generation
      ) {
        readerProgressAnchorRef.current = {
          checkpoint,
          generation: location.generation,
          instanceId: location.instanceId,
        };
        setReaderProgressAnchorStatus(
          `progress anchor armed · ${location.navigationUnit.title} · ${location.position ?? 'none'}`
        );
        return;
      }
      const stable = readerProgressAnchorsAreMateriallyStable(anchor.checkpoint, checkpoint);
      setReaderProgressAnchorStatus(
        `progress anchor stable ${stable ? 'yes' : 'no'} · ${anchor.checkpoint.position ?? 'none'}→${checkpoint.position ?? 'none'}`
      );
    } catch (error: unknown) {
      setReaderProgressAnchorStatus(
        `progress error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const armGestureAnchor = async () => {
    const location = (await readerRef.current?.getCurrentLocation()) ?? null;
    gestureAnchorRef.current = location;
    setGestureMatrixStatus(
      location
        ? `gesture anchor armed · ${resourceHref(location.locator.href)} · ${location.locator.locations?.progression?.toFixed(3) ?? 'none'}`
        : 'gesture anchor unavailable'
    );
  };

  const resetGestureLocation = async () => {
    const commands = readerRef.current;
    if (!commands) {
      setGestureMatrixStatus('gesture reset unavailable');
      return;
    }
    try {
      const moved = await commands.goToProgression(0);
      await waitForNavigation();
      const location = await commands.getCurrentLocation();
      gestureAnchorRef.current = null;
      setGestureMatrixStatus(
        location
          ? `gesture reset ${moved ? 'yes' : 'no'} · ${resourceHref(location.locator.href)} · ${location.locator.locations?.progression?.toFixed(3) ?? 'none'}`
          : 'gesture reset missing location'
      );
    } catch (error: unknown) {
      setGestureMatrixStatus(
        `gesture reset error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const prepareGestureBoundary = async () => {
    const commands = readerRef.current;
    const firstResource = publicationInfo?.readingOrder[0];
    if (!commands || !firstResource) {
      setGestureMatrixStatus('gesture boundary unavailable');
      return;
    }
    try {
      const moved = await commands.goTo({
        href: firstResource.href,
        locations: { progression: 0.75 },
        title: firstResource.title ?? null,
        type: firstResource.type ?? 'application/xhtml+xml',
      });
      await waitForNavigation();
      await waitForNavigation();
      const location = await commands.getCurrentLocation();
      gestureAnchorRef.current = null;
      setGestureMatrixStatus(
        location
          ? `gesture boundary ${moved ? 'yes' : 'no'} · ${resourceHref(location.locator.href)} · ${location.locator.locations?.progression?.toFixed(3) ?? 'none'}`
          : 'gesture boundary missing location'
      );
    } catch (error: unknown) {
      setGestureMatrixStatus(
        `gesture boundary error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const verifyGestureMovement = async () => {
    await waitForNavigation();
    const before = gestureAnchorRef.current;
    const after = (await readerRef.current?.getCurrentLocation()) ?? null;
    if (!before || !after) {
      setGestureMatrixStatus('gesture verification unavailable');
      return;
    }
    const sameResource = resourceHref(before.locator.href) === resourceHref(after.locator.href);
    const beforeProgress = before.locator.locations?.progression ?? before.overallProgress ?? 0;
    const afterProgress = after.locator.locations?.progression ?? after.overallProgress ?? 0;
    const moved =
      !sameResource ||
      before.position !== after.position ||
      Math.abs(beforeProgress - afterProgress) > 0.005;
    setGestureMatrixStatus(
      `gesture moved ${moved ? 'yes' : 'no'} · resource same ${sameResource ? 'yes' : 'no'} · ${beforeProgress.toFixed(3)}→${afterProgress.toFixed(3)}`
    );
    gestureAnchorRef.current = after;
  };

  const settleFocusedGesture = async () => {
    setFocusGestureSettlementStatus('gesture settlement pending');
    await waitForNavigation();
    await waitForNavigation();
    await waitForNavigation();
    setFocusGestureSettlementStatus('gesture settlement complete');
  };

  const probeNavigationPolicy = async () => {
    try {
      const status = await readerRef.current?.getNavigationPolicy();
      const coherent =
        status !== undefined &&
        navigationPolicyStatus !== null &&
        status.instanceId === navigationPolicyStatus.instanceId &&
        status.generation === navigationPolicyStatus.generation &&
        JSON.stringify(status) === JSON.stringify(navigationPolicyStatus);
      setNavigationPolicyCommandStatus(`policy command coherent ${coherent ? 'yes' : 'no'}`);
    } catch (error: unknown) {
      setNavigationPolicyCommandStatus(
        `policy command error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const armRestore = async () => {
    const commands = readerRef.current;
    const page = positionsPage;
    if (!commands || !page || page.positions.length === 0) {
      setNavigationStatus('restore unavailable');
      return;
    }
    const target = page.positions.at(-1)!;
    try {
      await commands.goTo(target);
      await currentCommandLocation();
      setRestoreLocator(target);
      setNavigationStatus(
        `restore armed · ${target.href} · ${target.locations?.position ?? 'none'}`
      );
    } catch (error: unknown) {
      setNavigationStatus(
        `restore error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const verifyRestore = async () => {
    const current = (await readerRef.current?.getCurrentLocation()) ?? null;
    const expected = restoreLocator;
    const matches =
      current !== null &&
      expected !== undefined &&
      resourceHref(current.locator.href) === resourceHref(expected.href) &&
      (expected.locations?.position === undefined ||
        current.position === expected.locations.position ||
        current.locator.locations?.position === expected.locations.position);
    setNavigationStatus(
      `restore ${matches ? 'verified' : 'mismatch'} · ${current?.locator.href ?? 'missing'} · ${current?.reason ?? 'missing'} · ${current?.position ?? 'none'}`
    );
  };

  const runInvalidNavigation = async () => {
    const commands = readerRef.current;
    if (!commands) {
      setNavigationStatus('invalid navigation unavailable');
      return;
    }
    let invalidCode = 'missing';
    try {
      await commands.goToPosition((publicationInfo?.positionCount ?? 0) + 1);
      invalidCode = 'unexpected-success';
    } catch (error: unknown) {
      invalidCode = error instanceof NativeEpubKitError ? error.code : 'unknown';
    }
    try {
      await commands.goToProgression(1);
      await currentCommandLocation();
      let boundary = true;
      for (let attempt = 0; attempt < 12 && boundary; attempt += 1) {
        boundary = await commands.goForward();
      }
      setNavigationStatus(`invalid navigation ${invalidCode} · boundary ${boundary}`);
    } catch (error: unknown) {
      setNavigationStatus(
        `invalid navigation ${invalidCode} · boundary error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const applyPreferencesAtCurrentLocation = async (
    nextPreferences: ReaderPreferences,
    label: string
  ) => {
    const commands = readerRef.current;
    if (!commands) {
      setPreferenceAnchorStatus(`${label} unavailable`);
      return;
    }
    try {
      const location = await commands.getCurrentLocation();
      preferenceAnchorRef.current = location;
      if (location && isReaderProgressLocation(location)) {
        readerProgressAnchorRef.current = {
          checkpoint: createReaderProgressState(location).current,
          generation: location.generation,
          instanceId: location.instanceId,
        };
        setReaderProgressAnchorStatus(`${label} progress anchor armed`);
      }
      setPreferenceAnchorStatus(`${label} pending`);
      setPreferenceCommandStatus('command not checked');
      setPreferences(nextPreferences);
    } catch (error: unknown) {
      setPreferenceAnchorStatus(
        `${label} error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const probePreferences = async () => {
    const commands = readerRef.current;
    if (!commands || !preferencesStatus) {
      setPreferenceCommandStatus('command unavailable');
      return;
    }
    try {
      const commandStatus = await commands.getPreferences();
      const coherent =
        commandStatus.instanceId === preferencesStatus.instanceId &&
        commandStatus.generation === preferencesStatus.generation &&
        preferenceStatusSignature(commandStatus) === preferenceStatusSignature(preferencesStatus);
      setPreferenceCommandStatus(`command coherent ${coherent ? 'yes' : 'no'}`);
    } catch (error: unknown) {
      setPreferenceCommandStatus(
        `command error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const inspectDiagnostics = async () => {
    const commands = readerRef.current;
    if (!commands) {
      setDiagnosticStatus('Issue report unavailable');
      return;
    }
    setDiagnosticStatus('Building redacted issue report…');
    try {
      const diagnostics = await commands.getDiagnostics();
      setReaderDiagnostics(diagnostics);
      setDiagnosticReport(createReaderDiagnosticReport(diagnostics));
      setDiagnosticStatus('Redacted issue report ready');
      setPreferencesPanelVisible(false);
    } catch (error: unknown) {
      setDiagnosticStatus(
        `Issue report error ${error instanceof NativeEpubKitError ? error.code : 'unknown'}`
      );
    }
  };

  const preferenceSupport = (name: ReaderPreferencesStatus['support'][number]['name']) =>
    preferencesStatus?.support.find((item) => item.name === name)?.supported ?? false;
  const fontSizeSupported = preferenceSupport('fontSize');
  const spreadSupported = preferenceSupport('spread');
  const disabledPreferences =
    preferencesStatus?.support
      .filter((item) => !item.supported)
      .map((item) => `${item.name}:${item.reason}`)
      .join(',') ?? 'pending';
  const appliedPreferenceCount = preferencesStatus
    ? Object.keys(preferencesStatus.applied).length
    : 0;
  const navigationUnitIdentityIsCoherent =
    navigationUnitSnapshot !== null &&
    publicationInfo !== null &&
    navigationUnitSnapshot.instanceId === publicationInfo.instanceId &&
    navigationUnitSnapshot.generation === publicationInfo.generation;
  const navigationUnitIdsAreUnique =
    navigationUnitSnapshot !== null &&
    new Set(navigationUnitSnapshot.units.map((unit) => unit.id)).size ===
      navigationUnitSnapshot.units.length;
  const navigationUnitAliasesAreLinked =
    navigationUnitSnapshot !== null &&
    navigationUnitSnapshot.aliases.every((alias) =>
      navigationUnitSnapshot.units.some((unit) => unit.id === alias.unitId)
    );
  const navigationUnitIntervalsAreOrdered =
    navigationUnitSnapshot !== null &&
    navigationUnitSnapshot.units.every(
      (unit) =>
        unit.startPosition === undefined ||
        unit.endPositionExclusive === undefined ||
        unit.endPositionExclusive > unit.startPosition
    );
  const navigationUnitGranularity = navigationUnitSnapshot
    ? typeof navigationUnitSnapshot.granularity === 'string'
      ? navigationUnitSnapshot.granularity
      : `depth-${navigationUnitSnapshot.granularity.depth}`
    : 'pending';
  const footnoteDiagnosticsText = footnote
    ? `${footnote.platform} · ${footnote.classification} footnote · ${footnote.href} · id ${footnote.id ?? 'none'} · language ${footnote.language ?? 'none'} · direction ${footnote.direction ?? 'none'} · html ${footnote.html ? 'bounded' : 'none'} · truncated ${footnote.truncated ? 'yes' : 'no'} · stability ${footnoteStability ? `${footnoteStability.stable ? 'stable' : 'changed'} after ${footnoteStability.delayMilliseconds} ms` : 'pending'} · source ${typeof footnote.sourceLocator.href === 'string' ? footnote.sourceLocator.href : 'missing'} · target ${typeof footnote.targetLocator?.href === 'string' ? footnote.targetLocator.href : 'missing'} · text ${footnote.text}`
    : 'Footnote action pending';
  const linkDiagnosticsText = linkAction
    ? `${linkAction.platform} · ${linkAction.kind} link · ${linkAction.disposition} · ${linkAction.href} · scheme ${linkAction.scheme ?? 'none'} · source ${typeof linkAction.sourceLocator.href === 'string' ? linkAction.sourceLocator.href : 'missing'} · target ${typeof linkAction.targetLocator?.href === 'string' ? linkAction.targetLocator.href : 'none'}`
    : 'Link action pending';
  const imageDiagnosticsText = imageAction
    ? `${imageAction.platform} · ${imageAction.source.kind} · resolvable ${imageAction.source.resolvable ? 'yes' : 'no'} · alt ${imageAction.alt ?? 'none'} · caption ${imageAction.caption ?? 'none'} · geometry ${imageAction.geometry?.viewRect && imageAction.geometry.windowRect ? 'view+window' : imageAction.geometry ? 'viewport-only' : 'omitted'} · zoom ${imageAction.rights.canZoom ? 'allowed' : 'denied'} · share ${imageAction.rights.canShare ? 'allowed' : 'denied'} · ${imageStatus}`
    : imageStatus;
  const selectionGeometry = selectionAction?.selection.geometry;
  const selectionViewRect = selectionGeometry?.visibleViewRect ?? selectionGeometry?.viewRect;
  const selectionVisibleGeometryIsPresent =
    selectionGeometry?.visibleViewRect !== undefined &&
    selectionGeometry.visibleWindowRect !== undefined;
  const selectionLifecycleText = selectionChange
    ? `${selectionChange.platform} · lifecycle ${selectionChange.reason} · selection ${selectionChange.selection ? 'active' : 'none'} · handles ${selectionChange.handlesActive ? 'retained' : 'released'} · sequence ${selectionChange.sequence}`
    : 'Selection lifecycle pending';
  const selectionDiagnosticsText = selectionAction
    ? `${selectionAction.platform} · ${selectionAction.actionId} · selection ${selectionAction.selection.text} · direction ${selectionAction.selection.direction ?? 'auto'} · language ${selectionAction.selection.language ?? 'none'} · copy ${selectionAction.selection.copyAllowed ? 'allowed' : 'denied'} · truncated ${selectionAction.selection.truncated ? 'yes' : 'no'} · view ${selectionGeometry?.viewRect ? `${selectionGeometry.viewRect.x.toFixed(1)},${selectionGeometry.viewRect.y.toFixed(1)} ${selectionGeometry.viewRect.width.toFixed(1)}×${selectionGeometry.viewRect.height.toFixed(1)}` : 'missing'} · window ${selectionGeometry?.windowRect ? `${selectionGeometry.windowRect.x.toFixed(1)},${selectionGeometry.windowRect.y.toFixed(1)}` : 'missing'} · visible ${selectionVisibleGeometryIsPresent ? 'clipped' : 'missing'} · spaces ${selectionSpacesAreConsistent(selectionAction) ? 'consistent' : 'invalid'} · handles ${selectionAction.handlesActive ? 'retained' : 'lost'} · command ${stableCommandStatus} · locator ${selectionAction.selection.locator.href}`
    : 'Selection action pending';

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <View style={[styles.heading, readerFocusMode && styles.hidden]}>
          {!isLandscape && !readerFocusMode ? (
            <>
              <Text style={styles.eyebrow}>NATIVE EPUB KIT · LIFECYCLE QUALIFICATION</Text>
              <Text style={styles.title}>Readium navigator host</Text>
            </>
          ) : null}
          <Text testID="reader-state" style={styles.state}>
            {assetError ??
              (readerState
                ? `${readerState.platform} · ${displayedState ?? readerState.state}${displayedError ? ` · ${displayedError.code} · ${displayedError.phase}` : ''} · generation ${readerState.generation} · instance ${readerState.instanceId.slice(0, 6)} · owned ${readerState.hostNavigatorCount} · emissions ${emissionCount}`
                : 'Loading deterministic fixtures…')}
          </Text>
          <Text numberOfLines={1} testID="session-diagnostics" style={styles.diagnostics}>
            {readerState
              ? `${readerState.platform} · session active ${readerState.sessionDiagnostics.activeSessions} · assets ${readerState.sessionDiagnostics.ownedAssets} · publications ${readerState.sessionDiagnostics.ownedPublications} · leases ${readerState.sessionDiagnostics.sourceLeases} · closed ${readerState.sessionDiagnostics.completedSessions} · violations ${readerState.sessionDiagnostics.forcedReleaseViolations} · high-water ${readerState.sessionDiagnostics.maximumActiveSessions}/${readerState.sessionDiagnostics.maximumOwnedAssets}/${readerState.sessionDiagnostics.maximumOwnedPublications} · memory ${readerState.sessionDiagnostics.memorySampleCount} · bounded ${readerState.sessionDiagnostics.postWarmupMemoryIsBounded === undefined ? 'pending' : readerState.sessionDiagnostics.postWarmupMemoryIsBounded ? 'yes' : 'no'} · growth ${readerState.sessionDiagnostics.postWarmupGrowthBytes ?? 'pending'} · slope ${readerState.sessionDiagnostics.postWarmupSlopeBytesPerCycle ?? 'pending'}`
              : 'Publication session diagnostics pending'}
          </Text>
          <Text numberOfLines={1} testID="typography-diagnostics" style={styles.diagnostics}>
            {typographyDiagnostics
              ? `${typographyDiagnostics.platform} · ${typographyDiagnostics.mode} · font ${typographyDiagnostics.configuredFontFamily} · loaded ${typographyDiagnostics.fontLoaded ? 'yes' : 'no'} · faces 400 ${typographyDiagnostics.regularFaceLoaded ? 'yes' : 'no'} 700 ${typographyDiagnostics.boldFaceLoaded ? 'yes' : 'no'} · marker ${typographyDiagnostics.markerMode || 'none'} · en ${typographyDiagnostics.englishDirection}/${typographyDiagnostics.englishFontFamily} · ar ${typographyDiagnostics.arabicDirection}/${typographyDiagnostics.arabicFontFamily} · ur ${typographyDiagnostics.urduDirection}/${typographyDiagnostics.urduFontFamily} · range ${typographyDiagnostics.rangeFinite ? 'finite' : 'invalid'} · selection ${typographyDiagnostics.selectionApiAvailable ? 'available' : 'missing'} · locator ${typographyDiagnostics.locatorStableDuringProbe ? 'stable' : 'changed'} · ${typographyAnchorStatus} · ${typographyProgressionStatus}`
              : `Typography diagnostics pending · ${typographyAnchorStatus} · ${typographyProgressionStatus}`}
          </Text>
          <Text numberOfLines={1} testID="selection-diagnostics" style={styles.diagnostics}>
            {selectionDiagnosticsText}
          </Text>
          <Text numberOfLines={1} testID="selection-lifecycle" style={styles.diagnostics}>
            {selectionLifecycleText}
          </Text>
          <Text numberOfLines={1} testID="footnote-diagnostics" style={styles.diagnostics}>
            {footnoteDiagnosticsText}
          </Text>
          <Text numberOfLines={1} testID="link-diagnostics" style={styles.diagnostics}>
            {linkDiagnosticsText}
          </Text>
          <Text numberOfLines={2} testID="image-diagnostics" style={styles.diagnostics}>
            {imageDiagnosticsText}
          </Text>
          <Text numberOfLines={1} testID="progress-diagnostics" style={styles.diagnostics}>
            {progress
              ? `${progress.platform} · ${progress.layout} · chapter swipe ${progress.chapterTurnGesture} · ${progress.reason} · precision ${progress.precision} · ${progressHref} · resource ${progress.resourceProgress.toFixed(3)} · overall ${progress.overallProgress.toFixed(3)} · position ${progress.position ?? 'none'}/${progress.totalPositions ?? 'none'} · viewport ${progress.viewport ? 'range' : progress.visibleStartLocator ? 'anchor' : 'locator'} · baseline same ${progressStayedInResource ? 'yes' : 'no'} · vertical advanced ${verticalProgressAdvanced ? 'yes' : 'no'}`
              : 'Progress action pending'}
          </Text>
          <Text numberOfLines={1} testID="reader-progress" style={styles.diagnostics}>
            {stableLocation && isReaderProgressLocation(stableLocation) && readerProgressState
              ? `reader progress top-level · unit ${stableLocation.navigationUnit.title} · chapter ${stableLocation.chapterProgress.toFixed(3)} · overall ${stableLocation.overallProgress.toFixed(3)} · precision ${stableLocation.precision} · current ${readerProgressState.current.overallProgress.toFixed(3)} · furthest ${readerProgressState.furthest.overallProgress.toFixed(3)} · ${readerProgressAnchorStatus}`
              : `Reader progress pending · ${readerProgressAnchorStatus}`}
          </Text>
          <Text numberOfLines={1} testID="navigation-policy" style={styles.diagnostics}>
            {navigationPolicyStatus
              ? `policy ${navigationPolicyStatus.effectiveLayout}/${navigationPolicyStatus.readingProgression} · page ${navigationPolicyStatus.applied.pageTurnGesture} · chapter ${navigationPolicyStatus.applied.chapterTurnGesture} · edges ${navigationPolicyStatus.applied.edgeTapNavigation ? 'on' : 'off'} · keys ${navigationPolicyStatus.applied.hardwareKeyNavigation ? 'on' : 'off'} · suppressed ${navigationPolicyStatus.applied.inputSuppressed ? 'yes' : 'no'} · animated ${navigationPolicyStatus.applied.animatedTransitions ? 'yes' : 'no'} · application ${navigationPolicyStatus.application} · boundary ${navigationPolicyStatus.boundaryGranularity}/${navigationPolicyStatus.boundaryPrecision} · ${navigationPolicyCommandStatus} · ${gestureMatrixStatus}`
              : `Navigation policy pending · ${gestureMatrixStatus}`}
          </Text>
          <Text numberOfLines={1} testID="preferences-diagnostics" style={styles.diagnostics}>
            {preferencesStatus
              ? `preferences ${preferencesStatus.publicationLayout} · applied ${appliedPreferenceCount}/9 · disabled ${disabledPreferences || 'none'} · theme ${preferencesStatus.requested.theme} · font ${preferencesStatus.requested.fontSize.toFixed(2)} · ${preferencesStatus.requested.layout} · publisher ${preferencesStatus.requested.publisherStyles ? 'on' : 'off'} · controls font ${fontSizeSupported ? 'enabled' : 'disabled'} spread ${spreadSupported ? 'enabled' : 'disabled'} · ${preferenceAnchorStatus} · ${preferenceCommandStatus}`
              : 'Preferences status pending'}
          </Text>
          <Text numberOfLines={1} testID="publication-data" style={styles.diagnostics}>
            {publicationDataError
              ? `Publication data error ${publicationDataError}`
              : publicationInfo && positionsPage && tocMetrics
                ? `publication ${publicationInfo.title} · layout ${publicationInfo.layout} · progression ${publicationInfo.readingProgression ?? 'none'} · fonts ${publicationInfo.capabilities.customFonts ? 'on' : 'off'} · images ${publicationInfo.capabilities.images ? 'on' : 'off'} · precision ${publicationInfo.capabilities.progressPrecision} · toc top ${publicationInfo.tableOfContents.length} total ${tocMetrics.total} depth ${tocMetrics.maximumDepth} fragments ${tocMetrics.fragmentCount} duplicates ${tocMetrics.duplicateCount} · reading ${publicationInfo.readingOrder.length} · positions ${publicationInfo.positionCount} · page ${positionsPage.positions.length}/256 offset ${positionsPage.offset} next ${positionsPage.nextOffset ?? 'end'} · chain ${positionPageChainIsValid ? 'valid' : 'invalid'} · map ${typeof mappingMilliseconds === 'number' ? Math.round(mappingMilliseconds) : 'missing'}ms · bridge ${publicationBridgeMilliseconds ?? 'pending'}ms · warnings ${publicationInfo.capabilities.warnings.length > 0 ? publicationInfo.capabilities.warnings.join(',') : 'none'}`
                : 'Publication data pending'}
          </Text>
          <Text numberOfLines={1} testID="stable-navigation" style={styles.diagnostics}>
            {`${navigationStatus} · ${navigationBoundaryStatus} · event ${navigationBoundaryEvent ? `${navigationBoundaryEvent.boundary}/${navigationBoundaryEvent.direction}/${navigationBoundaryEvent.kind} ${navigationBoundaryEvent.navigationUnit.title}→${navigationBoundaryEvent.adjacentNavigationUnit?.title ?? 'publication'} ${navigationBoundaryEvent.precision}` : 'none'} · history ${navigationHistory?.entries.length ?? 'pending'}/${navigationHistory?.limit ?? 'pending'}`}
          </Text>
          <Text numberOfLines={1} testID="navigation-units" style={styles.diagnostics}>
            {navigationUnitError ??
              (navigationUnitSnapshot
                ? `units ${navigationUnitGranularity} · coherent ${navigationUnitIdentityIsCoherent ? 'yes' : 'no'} · count ${navigationUnitSnapshot.units.length} · toc ${navigationUnitSnapshot.diagnostics.selectedTocEntryCount}/${navigationUnitSnapshot.diagnostics.tocEntryCount} · aliases ${navigationUnitSnapshot.aliases.length} linked ${navigationUnitAliasesAreLinked ? 'yes' : 'no'} · fallbacks ${navigationUnitSnapshot.diagnostics.fallbackUnitCount} · unresolved ${navigationUnitSnapshot.diagnostics.unresolvedTocEntryCount} · order ${navigationUnitSnapshot.diagnostics.outOfOrderTocEntryCount} · issues ${navigationUnitSnapshot.diagnostics.issueCount}/${navigationUnitSnapshot.diagnostics.issuesTruncated} · ids ${navigationUnitIdsAreUnique ? 'unique' : 'duplicate'} · intervals ${navigationUnitIntervalsAreOrdered ? 'ordered' : 'invalid'} · first ${navigationUnitSnapshot.units[0]?.title ?? 'none'} · last ${navigationUnitSnapshot.units.at(-1)?.title ?? 'none'} · end ${navigationUnitSnapshot.units.at(-1)?.endPositionExclusive ?? 'none'}`
                : 'Navigation-unit derivation pending')}
          </Text>
          <Text numberOfLines={1} testID="decoration-status" style={styles.diagnostics}>
            {decorationStatus}
          </Text>
          <Text numberOfLines={2} testID="search-status" style={styles.diagnostics}>
            {searchStatus}
          </Text>
          <Text numberOfLines={1} testID="decoration-activation" style={styles.diagnostics}>
            {decorationActivation
              ? `${decorationActivation.platform} · group ${decorationActivation.group} · id ${decorationActivation.decoration.id} · style ${decorationActivation.decoration.style.type} · data ${canonicalJson(decorationActivation.decoration.data)} · geometry ${decorationActivation.geometry?.viewRect && decorationActivation.geometry.windowRect ? 'view+window' : decorationActivation.geometry ? 'viewport-only' : 'omitted'} · sequence ${decorationActivation.sequence} · activations ${decorationActivationCount}`
              : 'Decoration activation pending'}
          </Text>
          {navigationAction ? (
            <Text numberOfLines={1} testID="navigation-diagnostics" style={styles.diagnostics}>
              {`${navigationAction.platform} · ${navigationAction.action} ${navigationAction.success ? 'succeeded' : 'failed'} · from ${locatorHref(navigationAction.fromLocator)} · to ${locatorHref(navigationAction.toLocator)}`}
            </Text>
          ) : null}
        </View>

        {readerFocusMode ? (
          <View style={styles.focusHeader} testID="reader-focus-mode">
            <Text
              numberOfLines={1}
              style={styles.diagnostics}
              testID="focus-typography-diagnostics"
            >
              {typographyDiagnostics
                ? `${typographyDiagnostics.platform} · ${typographyDiagnostics.mode} · loaded ${typographyDiagnostics.fontLoaded ? 'yes' : 'no'} · marker ${typographyDiagnostics.markerMode || 'none'} · locator ${typographyDiagnostics.locatorStableDuringProbe ? 'stable' : 'changed'}`
                : 'Typography diagnostics pending'}
            </Text>
            <Text numberOfLines={1} style={styles.diagnostics} testID="focus-selection-diagnostics">
              {selectionDiagnosticsText}
            </Text>
            <Text numberOfLines={1} style={styles.diagnostics} testID="focus-selection-lifecycle">
              {selectionLifecycleText}
            </Text>
            <Text numberOfLines={1} style={styles.diagnostics} testID="focus-footnote-diagnostics">
              {footnoteDiagnosticsText}
            </Text>
            <Text numberOfLines={1} style={styles.diagnostics} testID="focus-link-diagnostics">
              {linkDiagnosticsText}
            </Text>
            <Text numberOfLines={1} style={styles.diagnostics} testID="focus-decoration-status">
              {decorationStatus}
            </Text>
            <Text numberOfLines={2} style={styles.diagnostics} testID="focus-search-status">
              {searchStatus}
            </Text>
            <Text numberOfLines={1} style={styles.diagnostics} testID="focus-decoration-activation">
              {decorationActivation
                ? `${decorationActivation.platform} · group ${decorationActivation.group} · id ${decorationActivation.decoration.id} · style ${decorationActivation.decoration.style.type} · geometry ${decorationActivation.geometry?.viewRect && decorationActivation.geometry.windowRect ? 'view+window' : decorationActivation.geometry ? 'viewport-only' : 'omitted'} · activations ${decorationActivationCount}`
                : 'Decoration activation pending'}
            </Text>
            <View style={styles.focusControls}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  settleFocusedGesture().catch(() =>
                    setFocusGestureSettlementStatus('gesture settlement error')
                  );
                }}
                style={styles.caseButton}
                testID="settle-gesture-input"
              >
                <Text style={styles.caseButtonText}>Settle gesture</Text>
              </Pressable>
              <Text style={styles.diagnostics} testID="focus-gesture-settlement">
                {focusGestureSettlementStatus}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReaderFocusMode(false)}
                style={styles.caseButton}
                testID="reader-unfocus"
              >
                <Text style={styles.caseButtonText}>Show controls</Text>
              </Pressable>
              {selectionChange?.selection ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    try {
                      await readerRef.current?.clearSelection();
                      setSelectionAction(null);
                    } catch {
                      setStableCommandStatus('error');
                    }
                  }}
                  style={styles.caseButton}
                  testID="clear-selection"
                >
                  <Text style={styles.caseButtonText}>Clear selection</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {!isLandscape && !readerFocusMode ? (
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsMounted((value) => !value)}
              style={styles.button}
              testID="toggle-reader"
            >
              <Text style={styles.buttonText}>{isMounted ? 'Unmount' : 'Remount'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFixture((value) => (value === 'minimal' ? 'toc' : 'minimal'));
                setSourceCase('valid');
              }}
              style={styles.button}
              testID="switch-fixture"
            >
              <Text style={styles.buttonText}>Switch source</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={runLocationCommand}
              style={styles.caseButton}
              testID="probe-progress"
            >
              <Text style={styles.caseButtonText}>
                {stableCommandStatus === 'location'
                  ? 'Probe ✓'
                  : stableCommandStatus === 'not-ready'
                    ? 'Probe !'
                    : stableCommandStatus === 'destroyed'
                      ? 'Probe ×'
                      : 'Probe'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setNextResourceSignal((signal) => signal + 1)}
              style={styles.caseButton}
              testID="next-resource"
            >
              <Text style={styles.caseButtonText}>Next</Text>
            </Pressable>
            <Text testID="fixture-name" style={styles.fixtureName}>
              {fixture}
            </Text>
          </View>
        ) : null}

        {!isLandscape && !readerFocusMode ? (
          <View style={styles.dataControls}>
            {(
              [
                ['minimal', 'Flat'],
                ['toc', 'Nested TOC'],
                ['stress', 'Large positions'],
                ['fixed', 'Fixed layout'],
                ['searchFailure', 'Search failure'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                accessibilityRole="button"
                key={value}
                onPress={() => {
                  setFixture(value);
                  setSourceCase('valid');
                  setPublicationInfo(null);
                  setPositionsPage(null);
                  setPublicationDataError(null);
                  setNavigationUnitSnapshot(null);
                  setNavigationUnitError(null);
                }}
                style={[styles.caseButton, fixture === value && styles.caseButtonActive]}
                testID={`fixture-${value}`}
              >
                <Text style={styles.caseButtonText}>{label}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => inspectNavigationUnits('top-level')}
              style={styles.caseButton}
              testID="units-top-level"
            >
              <Text style={styles.caseButtonText}>Top units</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => inspectNavigationUnits('leaf')}
              style={styles.caseButton}
              testID="units-leaf"
            >
              <Text style={styles.caseButtonText}>Leaf units</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => inspectNavigationUnits({ depth: 1 })}
              style={styles.caseButton}
              testID="units-depth-1"
            >
              <Text style={styles.caseButtonText}>Depth 1</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const operation =
                  fixture === 'toc' ? runNavigationBoundaryMatrix() : probeReaderProgressAnchor();
                operation.catch(() => setNavigationBoundaryStatus('Boundary/history matrix error'));
              }}
              style={styles.caseButton}
              testID="probe-chapter-progress"
            >
              <Text style={styles.caseButtonText}>Chapter progress</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLandscape && !readerFocusMode ? (
          <View style={styles.navigationControls}>
            <Pressable
              accessibilityRole="button"
              onPress={runNavigationMatrix}
              style={styles.caseButton}
              testID="run-navigation-matrix"
            >
              <Text style={styles.caseButtonText}>Navigation matrix</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={armRestore}
              style={styles.caseButton}
              testID="arm-restore"
            >
              <Text style={styles.caseButtonText}>Arm restore</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={verifyRestore}
              style={styles.caseButton}
              testID="verify-restore"
            >
              <Text style={styles.caseButtonText}>Verify restore</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={runInvalidNavigation}
              style={styles.caseButton}
              testID="invalid-navigation"
            >
              <Text style={styles.caseButtonText}>Invalid target</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLandscape && !readerFocusMode ? (
          <View style={styles.dataControls}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                runSearchMatrix().catch((error: unknown) =>
                  setSearchStatus(`Search matrix failed · ${decorationFailure(error)}`)
                );
              }}
              style={styles.caseButton}
              testID="run-search-matrix"
            >
              <Text style={styles.caseButtonText}>Search</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                runDecorationCoexistenceMatrix().catch((error: unknown) =>
                  setDecorationStatus(`Decoration matrix failed · ${decorationFailure(error)}`)
                );
              }}
              style={styles.caseButton}
              testID="run-decoration-matrix"
            >
              <Text style={styles.caseButtonText}>Decorations</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                runDecorationStressMatrix().catch((error: unknown) =>
                  setDecorationStatus(
                    `2,000-decoration matrix failed · ${decorationFailure(error)}`
                  )
                );
              }}
              style={styles.caseButton}
              testID="run-decoration-stress"
            >
              <Text style={styles.caseButtonText}>2,000 decorations</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                clearDecorationMatrix().catch((error: unknown) =>
                  setDecorationStatus(`Decoration clear failed · ${decorationFailure(error)}`)
                );
              }}
              style={styles.caseButton}
              testID="clear-decorations"
            >
              <Text style={styles.caseButtonText}>Clear decorations</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLandscape && !readerFocusMode ? (
          <View style={styles.dataControls}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const layout =
                  preferencesStatus?.requested.layout === 'paginated' ? 'scrolled' : 'paginated';
                applyPreferencesAtCurrentLocation(
                  {
                    ...preferences,
                    layout,
                    ...(layout === 'paginated' ? { spread: 'never' as const } : {}),
                  },
                  'navigation layout'
                ).catch(() => setPreferenceAnchorStatus('navigation layout unexpected error'));
              }}
              style={styles.caseButton}
              testID="toggle-navigation-layout"
            >
              <Text style={styles.caseButtonText}>Layout</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setNavigationPolicy((current) => ({
                  ...current,
                  pageTurnGesture:
                    navigationPolicyStatus?.applied.pageTurnGesture === 'disabled'
                      ? 'enabled'
                      : 'disabled',
                }))
              }
              style={styles.caseButton}
              testID="toggle-page-gesture"
            >
              <Text style={styles.caseButtonText}>Pages</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setNavigationPolicy((current) => ({
                  ...current,
                  chapterTurnGesture:
                    navigationPolicyStatus?.applied.chapterTurnGesture === 'enabled'
                      ? 'disabled'
                      : 'enabled',
                }))
              }
              style={styles.caseButton}
              testID="toggle-chapter-gesture"
            >
              <Text style={styles.caseButtonText}>Chapters</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setNavigationPolicy((current) => ({
                  ...current,
                  edgeTapNavigation: !navigationPolicyStatus?.applied.edgeTapNavigation,
                }))
              }
              style={styles.caseButton}
              testID="toggle-edge-taps"
            >
              <Text style={styles.caseButtonText}>Edges</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setNavigationPolicy((current) => ({
                  ...current,
                  hardwareKeyNavigation: !navigationPolicyStatus?.applied.hardwareKeyNavigation,
                }))
              }
              style={styles.caseButton}
              testID="toggle-hardware-keys"
            >
              <Text style={styles.caseButtonText}>Keys</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setNavigationPolicy((current) => ({
                  ...current,
                  inputSuppressed: !navigationPolicyStatus?.applied.inputSuppressed,
                }))
              }
              style={styles.caseButton}
              testID="toggle-input-suppression"
            >
              <Text style={styles.caseButtonText}>Suppress</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={armGestureAnchor}
              style={styles.caseButton}
              testID="arm-gesture-anchor"
            >
              <Text style={styles.caseButtonText}>Arm</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={resetGestureLocation}
              style={styles.caseButton}
              testID="reset-gesture-location"
            >
              <Text style={styles.caseButtonText}>Reset</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={prepareGestureBoundary}
              style={styles.caseButton}
              testID="prepare-gesture-boundary"
            >
              <Text style={styles.caseButtonText}>Boundary</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={verifyGestureMovement}
              style={styles.caseButton}
              testID="verify-gesture-movement"
            >
              <Text style={styles.caseButtonText}>Verify</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={probeNavigationPolicy}
              style={styles.caseButton}
              testID="probe-navigation-policy"
            >
              <Text style={styles.caseButtonText}>Status</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLandscape && !readerFocusMode ? (
          <View style={styles.typographyControls}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFixture('rtl');
                setSourceCase('valid');
                setTypographyDiagnostics(null);
              }}
              style={styles.caseButton}
              testID="fixture-rtl"
            >
              <Text style={styles.caseButtonText}>RTL font fixture</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFixture('mixed');
                setSourceCase('valid');
                setTypographyDiagnostics(null);
              }}
              style={styles.caseButton}
              testID="fixture-mixed-bidi"
            >
              <Text style={styles.caseButtonText}>Mixed bidi fixture</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFixture('footnotes');
                setSourceCase('valid');
                setFootnote(null);
                setFootnoteStability(null);
                setLinkAction(null);
              }}
              style={styles.caseButton}
              testID="fixture-footnotes"
            >
              <Text style={styles.caseButtonText}>Footnotes fixture</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFixture('images');
                setSourceCase('valid');
                setImageAction(null);
                setResolvedImage(null);
                setImageSharingAllowed(false);
                setImageStatus('Image activation pending · tap the illustration');
              }}
              style={styles.caseButton}
              testID="fixture-images"
            >
              <Text style={styles.caseButtonText}>Images fixture</Text>
            </Pressable>
            {(['preserve', 'hybrid', 'override'] as const).map((mode) => (
              <Pressable
                accessibilityRole="button"
                key={mode}
                onPress={async () => {
                  if (typographyMode !== mode) {
                    try {
                      const [anchor, policy] = await Promise.all([
                        readerRef.current?.getCurrentLocation() ?? null,
                        readerRef.current?.getNavigationPolicy() ?? null,
                      ]);
                      typographyAnchorRef.current = anchor;
                      typographyProgressionRef.current = policy?.readingProgression ?? null;
                      setTypographyAnchorStatus('typography anchor pending');
                      setTypographyProgressionStatus('typography progression pending');
                    } catch {
                      typographyAnchorRef.current = null;
                      typographyProgressionRef.current = null;
                      setTypographyAnchorStatus('typography anchor unavailable');
                      setTypographyProgressionStatus('typography progression unavailable');
                    }
                    setTypographyDiagnostics(null);
                  }
                  setTypographyMode(mode);
                }}
                style={[styles.caseButton, typographyMode === mode && styles.caseButtonActive]}
                testID={`typography-${mode}`}
              >
                <Text style={styles.caseButtonText}>{mode}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => setReaderFocusMode(true)}
              style={styles.caseButton}
              testID="reader-focus"
            >
              <Text style={styles.caseButtonText}>Focus reader</Text>
            </Pressable>
            <Text style={styles.sourceCase} testID="typography-mode">
              {typographyMode}
            </Text>
            {selectionChange?.selection ? (
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  try {
                    await readerRef.current?.clearSelection();
                    setSelectionAction(null);
                  } catch {
                    setStableCommandStatus('error');
                  }
                }}
                style={styles.caseButton}
                testID="clear-selection"
              >
                <Text style={styles.caseButtonText}>Clear selection</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!isLandscape && !readerFocusMode ? (
          <View style={styles.errorControls}>
            {(
              [
                ['valid', 'Valid'],
                ['content', 'Content URI'],
                ['remote', 'Remote'],
                ['missing', 'Missing'],
                ['corrupt', 'Corrupt'],
                ['unsupported', 'Unsupported'],
                ['unreadable', 'Unreadable'],
                ['closed', 'Close reader'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                accessibilityRole="button"
                key={value}
                onPress={() => setSourceCase(value)}
                style={[styles.caseButton, sourceCase === value && styles.caseButtonActive]}
                testID={`source-${value}`}
              >
                <Text style={styles.caseButtonText}>{label}</Text>
              </Pressable>
            ))}
            <Text style={styles.sourceCase} testID="source-case">
              {sourceCase}
            </Text>
          </View>
        ) : null}

        <View style={styles.readerShell}>
          {isMounted && fixtureUris ? (
            <EpubReaderView
              accessibilityLabel="Native EPUB reader"
              chapterGranularity="top-level"
              navigationPolicy={navigationPolicy}
              onError={({ error, sequence }) => {
                stableCallbackOrder.current.push(`error:${sequence}`);
                setStableError(error);
              }}
              onLocationChange={(location) => {
                stableCallbackOrder.current.push(`location:${location.sequence}`);
                setStableLocation(location);
                if (isReaderProgressLocation(location)) {
                  setReaderProgressState((current) =>
                    updateReaderProgressState(current ?? undefined, location)
                  );
                }
                if (location.reason === 'restored' || location.reason === 'preference-change') {
                  setNavigationStatus(
                    `${location.reason} · ${location.locator.href} · ${location.position ?? 'none'}`
                  );
                }
                if (location.reason === 'preference-change') {
                  const typographyAnchor = typographyAnchorRef.current;
                  if (typographyAnchor !== null) {
                    const sameTypographyResource =
                      resourceHref(typographyAnchor.locator.href) ===
                      resourceHref(location.locator.href);
                    const sameTypographyPosition =
                      typographyAnchor.position === undefined ||
                      location.position === undefined ||
                      typographyAnchor.position === location.position;
                    setTypographyAnchorStatus(
                      `typography anchor preserved ${sameTypographyResource && sameTypographyPosition ? 'yes' : 'no'} · ${typographyAnchor.position ?? 'none'}→${location.position ?? 'none'}`
                    );
                    typographyAnchorRef.current = null;
                  }
                  const anchor = preferenceAnchorRef.current;
                  if (anchor !== null) {
                    const sameResource =
                      resourceHref(anchor.locator.href) === resourceHref(location.locator.href);
                    const samePosition =
                      anchor.position === undefined ||
                      location.position === undefined ||
                      anchor.position === location.position;
                    setPreferenceAnchorStatus(
                      `anchor preserved ${sameResource && samePosition ? 'yes' : 'no'} · ${anchor.position ?? 'none'}→${location.position ?? 'none'}`
                    );
                    preferenceAnchorRef.current = null;
                  }
                  const progressAnchor = readerProgressAnchorRef.current;
                  if (
                    progressAnchor &&
                    isReaderProgressLocation(location) &&
                    progressAnchor.instanceId === location.instanceId &&
                    progressAnchor.generation === location.generation
                  ) {
                    const checkpoint = createReaderProgressState(location).current;
                    const stable = readerProgressAnchorsAreMateriallyStable(
                      progressAnchor.checkpoint,
                      checkpoint
                    );
                    setReaderProgressAnchorStatus(
                      `preference progress stable ${stable ? 'yes' : 'no'} · ${progressAnchor.checkpoint.position ?? 'none'}→${checkpoint.position ?? 'none'}`
                    );
                  }
                }
              }}
              onNavigationPolicyChange={(status) => {
                setNavigationPolicyStatus(status);
                const expectedProgression = typographyProgressionRef.current;
                if (expectedProgression !== null) {
                  setTypographyProgressionStatus(
                    `typography progression preserved ${expectedProgression === status.readingProgression ? 'yes' : 'no'} · ${expectedProgression}→${status.readingProgression}`
                  );
                  typographyProgressionRef.current = null;
                }
              }}
              onNavigationHistoryChange={setNavigationHistory}
              onNavigationUnitBoundary={setNavigationBoundaryEvent}
              onFootnotePress={handleFootnotePress}
              onLinkPress={(event) => {
                setLinkAction(event);
                setFootnote(null);
                setFootnoteStability(null);
              }}
              onPreferencesChange={setPreferencesStatus}
              onReady={({ sequence }) => {
                stableCallbackOrder.current.push(`ready:${sequence}`);
                setStableError(null);
                loadPublicationData().catch(() => setPublicationDataError('unexpected-error'));
              }}
              onStateChange={handleStableState}
              ref={(value) => {
                readerRef.current = value;
                if (value) retainedReaderRef.current = value;
              }}
              initialLocator={fixture === 'toc' ? restoreLocator : undefined}
              classifyFootnote={(candidate) =>
                candidate.id === 'consumer-navigate' ? 'navigate' : 'footnote'
              }
              footnotePolicy={{ mode: 'semantic-and-heuristic' }}
              imagePolicy={{ allowSharing: imageSharingAllowed, allowZoom: true }}
              linkPolicy={{
                allowedExternalSchemes: ['https'],
                externalLinks: 'intercept',
                unsupportedSchemes: 'block',
              }}
              preferences={preferences}
              selectionActions={[
                { id: 'highlight', title: 'Highlight' },
                { id: 'note', title: 'Note' },
                { id: 'share', title: 'Share Quote' },
              ]}
              onSelectionAction={(action) => {
                setSelectionAction(action);
                setStableCommandStatus('pending');
                readerRef.current
                  ?.getCurrentSelection()
                  .then((selection) => {
                    setStableCommandStatus(
                      selection !== null &&
                        canonicalJson(selection) === canonicalJson(action.selection)
                        ? 'selection'
                        : 'pending'
                    );
                  })
                  .catch(() => setStableCommandStatus('error'));
              }}
              onSelectionChange={(event) => {
                setSelectionChange(event);
                if (event.selection === null) setSelectionAction(null);
              }}
              onDecorationPress={(event) => {
                setDecorationActivation(event);
                setDecorationActivationCount((count) => count + 1);
              }}
              onImagePress={(event) => {
                setImageAction(event);
                setResolvedImage(null);
                setImageStatus(
                  `activated · ${event.source.contentType ?? 'unknown media type'} · handle ${event.source.handle ? 'present' : 'absent'}`
                );
              }}
              source={source}
              style={styles.reader}
              testID="epub-reader"
              typographyProfile={typographyProfile}
              unstable_qualification={{
                nextResourceSignal,
                onNavigationAction: (event) => setNavigationAction(event.nativeEvent),
                onProgress: (event) => handleProgress(event.nativeEvent),
                onReaderState: (event) => handleReaderState(event.nativeEvent),
                onTypographyDiagnostics: (event) => setTypographyDiagnostics(event.nativeEvent),
                progressProbeSignal,
              }}
            />
          ) : (
            <View style={styles.unmounted} testID="reader-unmounted">
              <Text style={styles.unmountedText}>
                {fixtureUris ? 'Native reader intentionally unmounted' : 'Preparing fixture assets'}
              </Text>
            </View>
          )}
          {!preferencesPanelVisible && isMounted && fixtureUris ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPreferencesPanelVisible(true)}
              style={styles.preferencesLauncher}
              testID="toggle-preferences"
            >
              <Text style={styles.preferencesLauncherText}>Preferences</Text>
            </Pressable>
          ) : null}
          {preferencesPanelVisible ? (
            <View style={styles.preferencesPanel} testID="preferences-panel">
              <View style={styles.preferencesPanelHeader}>
                <View>
                  <Text style={styles.preferencesPanelTitle}>Reader preferences</Text>
                  <Text style={styles.preferencesPanelMeta}>
                    {preferencesStatus
                      ? `${preferencesStatus.publicationLayout} · ${appliedPreferenceCount} applied · ${9 - appliedPreferenceCount} unavailable`
                      : 'Waiting for publication capabilities'}
                  </Text>
                </View>
                <View style={styles.preferencesHeaderActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      inspectDiagnostics().catch(() =>
                        setDiagnosticStatus('Issue report unexpected error')
                      )
                    }
                    style={styles.preferencesClose}
                    testID="open-diagnostics"
                  >
                    <Text style={styles.preferencesCloseText}>Issue report</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Close reader preferences"
                    accessibilityRole="button"
                    onPress={() => setPreferencesPanelVisible(false)}
                    style={styles.preferencesClose}
                    testID="close-preferences"
                  >
                    <Text style={styles.preferencesCloseText}>Close</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.preferencesActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    applyPreferencesAtCurrentLocation(showcasePreferences, 'profile').catch(() =>
                      setPreferenceAnchorStatus('profile unexpected error')
                    )
                  }
                  style={styles.preferenceButton}
                  testID="preferences-profile"
                >
                  <Text style={styles.preferenceButtonText}>Dark reading profile</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    applyPreferencesAtCurrentLocation({}, 'reset').catch(() =>
                      setPreferenceAnchorStatus('reset unexpected error')
                    )
                  }
                  style={styles.preferenceButton}
                  testID="preferences-reset"
                >
                  <Text style={styles.preferenceButtonText}>Reset defaults</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !fontSizeSupported }}
                  disabled={!fontSizeSupported}
                  onPress={() =>
                    applyPreferencesAtCurrentLocation(
                      {
                        ...preferences,
                        fontSize: preferencesStatus?.requested.fontSize === 1.6 ? 1 : 1.6,
                      },
                      'font'
                    ).catch(() => setPreferenceAnchorStatus('font unexpected error'))
                  }
                  style={[
                    styles.preferenceButton,
                    !fontSizeSupported && styles.preferenceButtonDisabled,
                  ]}
                  testID="preferences-font-size"
                >
                  <Text style={styles.preferenceButtonText}>Font size</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !spreadSupported }}
                  disabled={!spreadSupported}
                  onPress={() =>
                    applyPreferencesAtCurrentLocation(
                      {
                        ...preferences,
                        spread:
                          preferencesStatus?.requested.spread === 'always' ? 'never' : 'always',
                      },
                      'spread'
                    ).catch(() => setPreferenceAnchorStatus('spread unexpected error'))
                  }
                  style={[
                    styles.preferenceButton,
                    !spreadSupported && styles.preferenceButtonDisabled,
                  ]}
                  testID="preferences-spread"
                >
                  <Text style={styles.preferenceButtonText}>Spread</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    probePreferences().catch(() =>
                      setPreferenceCommandStatus('command unexpected error')
                    )
                  }
                  style={styles.preferenceButton}
                  testID="preferences-probe"
                >
                  <Text style={styles.preferenceButtonText}>Verify command</Text>
                </Pressable>
              </View>
              <Text numberOfLines={2} style={styles.preferencesUnavailable}>
                {disabledPreferences === 'pending'
                  ? 'Capability resolution pending'
                  : disabledPreferences || 'Every requested preference is supported'}
              </Text>
            </View>
          ) : null}
          {readerDiagnostics ? (
            <View style={styles.diagnosticPanel} testID="diagnostics-panel">
              <View style={styles.preferencesPanelHeader}>
                <View>
                  <Text style={styles.preferencesPanelTitle}>Reader issue report</Text>
                  <Text style={styles.preferencesPanelMeta}>{diagnosticStatus}</Text>
                </View>
                <Pressable
                  accessibilityLabel="Close reader issue report"
                  accessibilityRole="button"
                  onPress={() => {
                    setReaderDiagnostics(null);
                    setDiagnosticReport('');
                  }}
                  style={styles.preferencesClose}
                  testID="close-diagnostics"
                >
                  <Text style={styles.preferencesCloseText}>Close</Text>
                </Pressable>
              </View>
              <Text
                numberOfLines={4}
                selectable
                style={styles.diagnosticSummary}
                testID="diagnostics-summary"
              >
                {`${readerDiagnostics.platform} · ${readerDiagnostics.toolkit.name} ${readerDiagnostics.toolkit.version} · epub ${readerDiagnostics.publication.layout}/${readerDiagnostics.publication.readingProgression} · precision ${readerDiagnostics.publication.progressPrecision} · positions ${readerDiagnostics.publication.positionCount} · fonts ${readerDiagnostics.fonts.status} ${readerDiagnostics.fonts.faceCount}/${readerDiagnostics.fonts.familyCount} · features ${readerDiagnostics.features.filter((feature) => feature.enabled).length}/${readerDiagnostics.features.length} · stages ${diagnosticStageSummary(readerDiagnostics)} · warnings ${readerDiagnostics.warnings.length > 0 ? readerDiagnostics.warnings.join(',') : 'none'} · redaction ${readerDiagnostics.redaction.profile} · capabilities ${readerDiagnostics.features.map((feature) => `${feature.name}:${feature.stage}/${feature.enabled ? 'on' : 'off'}`).join(' · ')}`}
              </Text>
              <Text
                numberOfLines={3}
                selectable
                style={styles.diagnosticFeatures}
                testID="diagnostics-features"
              >
                {readerDiagnostics.features
                  .map(
                    (feature) =>
                      `${feature.name}:${feature.stage}/${feature.enabled ? 'on' : 'off'}`
                  )
                  .join(' · ')}
              </Text>
              <ScrollView style={styles.diagnosticReportScroll}>
                <Text selectable style={styles.diagnosticReport} testID="diagnostics-report">
                  {diagnosticReport}
                </Text>
              </ScrollView>
            </View>
          ) : null}
          {selectionAction && selectionViewRect ? (
            <View
              pointerEvents="none"
              style={[
                styles.selectionMarker,
                {
                  left: Math.max(2, selectionViewRect.x - 36),
                  top: Math.max(2, selectionViewRect.y + selectionViewRect.height / 2 - 14),
                },
              ]}
              testID="selection-marker"
            >
              <Text style={styles.selectionMarkerText}>A</Text>
            </View>
          ) : null}
          {imageAction ? (
            <View style={styles.imageSheet} testID="image-sheet">
              <View style={styles.footnoteHeader}>
                <Text style={styles.footnoteTitle}>Activated image</Text>
                <Pressable
                  accessibilityLabel="Close image actions"
                  accessibilityRole="button"
                  onPress={() => {
                    if (resolvedImage) {
                      readerRef.current?.releaseImageSource(resolvedImage.id).catch(() => {});
                    }
                    setResolvedImage(null);
                    setImageAction(null);
                    setImageStatus('Image activation pending');
                  }}
                  style={styles.footnoteClose}
                  testID="close-image-sheet"
                >
                  <Text style={styles.footnoteCloseText}>Close</Text>
                </Pressable>
              </View>
              <Text numberOfLines={3} style={styles.footnoteText} testID="image-metadata">
                {`${imageAction.alt ?? 'No alt text'} · ${imageAction.caption ?? 'No caption'} · ${imageAction.locator.href}`}
              </Text>
              <Text style={styles.footnoteMeta} testID="image-policy-status">
                {`Zoom ${imageAction.rights.canZoom ? 'allowed' : 'denied'} · share snapshot ${imageAction.rights.canShare ? 'allowed' : 'denied'} · live sharing ${imageSharingAllowed ? 'enabled' : 'disabled'}`}
              </Text>
              <View style={styles.imageActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => resolveActivatedImage('zoom')}
                  style={styles.caseButton}
                  testID="resolve-image-zoom"
                >
                  <Text style={styles.caseButtonText}>Resolve zoom</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => resolveActivatedImage('share')}
                  style={styles.caseButton}
                  testID="resolve-image-share"
                >
                  <Text style={styles.caseButtonText}>Resolve share</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setImageSharingAllowed((allowed) => !allowed);
                    setImageStatus(
                      `sharing policy ${imageSharingAllowed ? 'disabled' : 'enabled'} · activation snapshot remains immutable`
                    );
                  }}
                  style={[styles.caseButton, imageSharingAllowed && styles.caseButtonActive]}
                  testID="toggle-image-sharing"
                >
                  <Text style={styles.caseButtonText}>Sharing policy</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={releaseResolvedImage}
                  style={styles.caseButton}
                  testID="release-image-source"
                >
                  <Text style={styles.caseButtonText}>Release file</Text>
                </Pressable>
              </View>
              <Text numberOfLines={2} style={styles.footnoteMeta} testID="image-resolution-status">
                {imageStatus}
              </Text>
            </View>
          ) : null}
          {footnote ? (
            <View style={styles.footnoteSheet} testID="footnote-sheet">
              <View style={styles.footnoteHeader}>
                <Text style={styles.footnoteTitle}>Footnote</Text>
                <Pressable
                  accessibilityLabel="Close footnote"
                  accessibilityRole="button"
                  onPress={() => {
                    setFootnote(null);
                    setFootnoteStability(null);
                  }}
                  style={styles.footnoteClose}
                  testID="close-footnote"
                >
                  <Text style={styles.footnoteCloseText}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.footnoteText} testID="footnote-text">
                {footnote.text}
              </Text>
              <Text style={styles.footnoteMeta} testID="footnote-stability">
                {footnoteStability
                  ? `Reading locator ${footnoteStability.stable ? 'stable' : 'changed'} after ${footnoteStability.delayMilliseconds} ms while overlay open · source ${footnoteStability.source} · current ${footnoteStability.current}`
                  : 'Checking reading locator while overlay is open…'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f3ea',
    paddingTop: 48,
  },
  content: {
    flex: 1,
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  heading: {
    gap: 3,
  },
  hidden: {
    display: 'none',
  },
  focusHeader: {
    gap: 3,
  },
  focusControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  eyebrow: {
    color: '#8b6914',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#14213d',
    fontSize: 24,
    fontWeight: '700',
  },
  state: {
    color: '#44506a',
    fontSize: 13,
    lineHeight: 18,
  },
  diagnostics: {
    color: '#44506a',
    fontSize: 10,
    lineHeight: 13,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  errorControls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  dataControls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  typographyControls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  navigationControls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  button: {
    backgroundColor: '#14213d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  caseButton: {
    backgroundColor: '#5b6478',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  caseButtonActive: {
    backgroundColor: '#8b6914',
  },
  caseButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  fixtureName: {
    color: '#8b6914',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 'auto',
    textTransform: 'uppercase',
  },
  sourceCase: {
    color: '#8b6914',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 'auto',
    textTransform: 'uppercase',
  },
  readerShell: {
    borderColor: 'rgba(20, 33, 61, 0.18)',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 300,
    overflow: 'hidden',
  },
  reader: {
    flex: 1,
  },
  preferencesLauncher: {
    backgroundColor: '#8b6914',
    borderBottomLeftRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 35,
  },
  preferencesLauncherText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  preferencesPanel: {
    backgroundColor: 'rgba(255, 250, 240, 0.98)',
    borderColor: '#c9a227',
    borderRadius: 12,
    borderWidth: 2,
    elevation: 40,
    gap: 10,
    left: 8,
    padding: 12,
    position: 'absolute',
    right: 8,
    shadowColor: '#000000',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    top: 8,
    zIndex: 40,
  },
  preferencesPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  preferencesHeaderActions: {
    flexDirection: 'row',
    gap: 6,
  },
  preferencesPanelTitle: {
    color: '#14213d',
    fontSize: 16,
    fontWeight: '800',
  },
  preferencesPanelMeta: {
    color: '#8b6914',
    fontSize: 10,
    fontWeight: '700',
  },
  preferencesActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  preferenceButton: {
    backgroundColor: '#14213d',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  preferenceButtonDisabled: {
    opacity: 0.32,
  },
  preferenceButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  preferencesClose: {
    backgroundColor: '#8b6914',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  preferencesCloseText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  preferencesUnavailable: {
    color: '#5b6478',
    fontSize: 10,
    lineHeight: 13,
  },
  diagnosticPanel: {
    backgroundColor: 'rgba(255, 250, 240, 0.99)',
    borderColor: '#14213d',
    borderRadius: 12,
    borderWidth: 2,
    bottom: 8,
    elevation: 50,
    gap: 8,
    left: 8,
    padding: 12,
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 50,
  },
  diagnosticSummary: {
    color: '#26334f',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  diagnosticFeatures: {
    color: '#5b6478',
    fontSize: 9,
    lineHeight: 13,
  },
  diagnosticReportScroll: {
    backgroundColor: '#f0eadc',
    borderRadius: 8,
    flex: 1,
    padding: 10,
  },
  diagnosticReport: {
    color: '#26334f',
    fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo' }),
    fontSize: 9,
    lineHeight: 13,
  },
  selectionMarker: {
    alignItems: 'center',
    backgroundColor: '#c9a227',
    borderColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 2,
    elevation: 20,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    width: 28,
    zIndex: 20,
  },
  selectionMarkerText: {
    color: '#14213d',
    fontSize: 12,
    fontWeight: '800',
  },
  imageSheet: {
    backgroundColor: '#fffaf0',
    borderColor: '#c9a227',
    borderRadius: 18,
    borderWidth: 2,
    bottom: 12,
    elevation: 30,
    gap: 10,
    left: 12,
    padding: 18,
    position: 'absolute',
    right: 12,
    shadowColor: '#000000',
    shadowOffset: { height: -3, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 30,
  },
  imageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  footnoteSheet: {
    backgroundColor: '#fffaf0',
    borderColor: '#c9a227',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 2,
    bottom: 0,
    elevation: 30,
    gap: 10,
    left: 0,
    maxHeight: '55%',
    padding: 18,
    position: 'absolute',
    right: 0,
    shadowColor: '#000000',
    shadowOffset: { height: -3, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 30,
  },
  footnoteHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footnoteTitle: {
    color: '#14213d',
    fontSize: 18,
    fontWeight: '800',
  },
  footnoteClose: {
    backgroundColor: '#14213d',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  footnoteCloseText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  footnoteText: {
    color: '#26334f',
    fontSize: 15,
    lineHeight: 22,
  },
  footnoteMeta: {
    color: '#8b6914',
    fontSize: 11,
    fontWeight: '700',
  },
  unmounted: {
    alignItems: 'center',
    backgroundColor: '#f5f0e4',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  unmountedText: {
    color: '#44506a',
    textAlign: 'center',
  },
});
