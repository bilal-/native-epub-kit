import { Asset } from 'expo-asset';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import {
  EpubReaderView,
  type EpubReaderViewRef,
  type Locator,
  type PublicationSource,
  type ReaderDecoration,
  type ReaderLocationEvent,
  type ReaderPreferences,
  type ReaderPreferencesStatus,
  type ReaderReadyEvent,
  type ReaderSearchSession,
  type ReaderState,
  type TypographyDiagnostics,
  type TypographyProfile,
  type TypographyPublisherStyleMode,
} from 'native-epub-kit';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const minimalFixture =
  require('../../packages/testing/fixtures/generated/minimal-en.epub') as number;
const tocFixture = require('../../packages/testing/fixtures/generated/toc-complex.epub') as number;
const rtlFixture =
  require('../../packages/testing/fixtures/generated/rtl-custom-font.epub') as number;
const stressFixture =
  require('../../packages/testing/fixtures/generated/annotation-stress.epub') as number;

const REPORT_FILE_NAME = 'native-epub-kit-performance.json';
const WAIT_TIMEOUT_MS = 30_000;
const FRAGMENT_DIAGNOSTIC_ONLY =
  process.env.EXPO_PUBLIC_PERFORMANCE_FRAGMENT_DIAGNOSTIC_ONLY === '1';
const RESTORE_DIAGNOSTIC_ONLY = process.env.EXPO_PUBLIC_PERFORMANCE_RESTORE_ONLY === '1';

interface FixtureUris {
  minimal: string;
  rtl: string;
  stress: string;
  toc: string;
}

type PublicationSessionDiagnostics = ReaderState['sessionDiagnostics'];

interface SampleSummary {
  count: number;
  maximumMs: number;
  meanMs: number;
  minimumMs: number;
  p50Ms: number;
  p95Ms: number;
  samplesMs: number[];
}

interface EventRateSummary {
  durationMs: number;
  eventCount: number;
  maximumEventsPerSecond: number;
  pass: boolean;
}

interface PerformanceReport {
  completedAt?: string;
  documentType: 'native-epub-kit-performance-report';
  environment: {
    libraryVersion: string;
    osVersion: string;
    platform: 'android' | 'ios';
    toolkitRevision?: string;
    toolkitVersion: string;
  };
  error?: string;
  errorPhase?: string;
  metrics: Record<string, unknown>;
  overallStatus: 'failed' | 'in-progress' | 'passed';
  schemaVersion: '1.0.0';
  startedAt: string;
}

interface EventWaiter<T> {
  predicate: (event: T) => boolean;
  reject: (error: Error) => void;
  resolve: (event: T) => void;
  timer: ReturnType<typeof setTimeout>;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const waitForEvent = <T,>(
  waiters: MutableRefObject<EventWaiter<T>[]>,
  predicate: (event: T) => boolean,
  label: string,
  timeoutMs = WAIT_TIMEOUT_MS
) =>
  new Promise<T>((resolve, reject) => {
    const waiter: EventWaiter<T> = {
      predicate,
      reject,
      resolve,
      timer: setTimeout(() => {
        waiters.current = waiters.current.filter((candidate) => candidate !== waiter);
        reject(new Error(`${label.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')}_TIMEOUT`));
      }, timeoutMs),
    };
    waiters.current.push(waiter);
  });

const emitEvent = <T,>(waiters: MutableRefObject<EventWaiter<T>[]>, event: T) => {
  const matches = waiters.current.filter((waiter) => waiter.predicate(event));
  if (matches.length === 0) return;
  waiters.current = waiters.current.filter((waiter) => !matches.includes(waiter));
  for (const waiter of matches) {
    clearTimeout(waiter.timer);
    waiter.resolve(event);
  }
};

const rejectWaiters = <T,>(waiters: MutableRefObject<EventWaiter<T>[]>, error: Error) => {
  const active = waiters.current;
  waiters.current = [];
  for (const waiter of active) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
};

const roundedMilliseconds = (startedAt: number) =>
  Math.max(0, Math.round(performance.now() - startedAt));

const percentile = (sorted: readonly number[], value: number) =>
  sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)] ?? 0;

const summarize = (values: readonly number[]): SampleSummary => {
  const samplesMs = [...values].sort((left, right) => left - right);
  const total = samplesMs.reduce((sum, value) => sum + value, 0);
  return {
    count: samplesMs.length,
    maximumMs: samplesMs.at(-1) ?? 0,
    meanMs: samplesMs.length === 0 ? 0 : Math.round(total / samplesMs.length),
    minimumMs: samplesMs[0] ?? 0,
    p50Ms: percentile(samplesMs, 0.5),
    p95Ms: percentile(samplesMs, 0.95),
    samplesMs,
  };
};

const performanceFile = () => new ExpoFile(Paths.document, REPORT_FILE_NAME);

const writeReport = (report: PerformanceReport) => {
  performanceFile().write(`${JSON.stringify(report, null, 2)}\n`);
};

const sourceFor = (uri: string): PublicationSource => ({ kind: 'file', uri });

const resourceHref = (href: string) => href.split('#', 1)[0]?.replace(/^\//, '') ?? href;

const stressLocator = (index: number): Locator => {
  const number = String(index).padStart(4, '0');
  return {
    href: 'EPUB/text/stress.xhtml',
    locations: { fragments: [`paragraph-${number}`] },
    text: { highlight: `Addressable paragraph ${number}.` },
    type: 'application/xhtml+xml',
  };
};

const stressDecoration = (index: number): ReaderDecoration => ({
  data: { fixture: 'annotation-stress', index },
  id: `performance-${String(index).padStart(4, '0')}`,
  locator: stressLocator(index),
  style: {
    tint: index % 2 === 0 ? '#e8c97a99' : '#8eb8cc99',
    type: index % 5 === 0 ? 'underline' : 'highlight',
  },
});

const typographyProfile = (publisherStyles: TypographyPublisherStyleMode): TypographyProfile => ({
  defaultFontFamilies: ['Lateef Qualification', 'serif'],
  publisherStyles,
  rules: [
    { direction: 'ltr', target: { kind: 'language', value: 'en' } },
    {
      fontFamilies: ['Lateef Qualification', 'serif'],
      lineHeight: 1.65,
      target: { kind: 'language', value: 'ar' },
    },
    {
      fontFamilies: ['Lateef Qualification', 'serif'],
      lineHeight: 1.65,
      target: { kind: 'language', value: 'ur' },
    },
    { fontWeight: 700, target: { kind: 'class', value: 'quranic' } },
  ],
});

const readCompleteSearch = async (commands: EpubReaderViewRef, session: ReaderSearchSession) => {
  let cursor: string | undefined = session.nextCursor;
  let resultCount = 0;
  let pageCount = 0;
  let truncated = false;
  while (cursor !== undefined) {
    const page = await commands.getSearchPage(session.id, cursor);
    pageCount += 1;
    resultCount += page.results.length;
    truncated ||= page.truncated;
    cursor = page.nextCursor;
    if (pageCount > 20) throw new Error('SEARCH_PAGE_BOUND_EXCEEDED');
  }
  return { pageCount, resultCount, truncated };
};

const maximumEventsPerSecond = (timestamps: readonly number[]) => {
  let maximum = 0;
  let start = 0;
  for (let end = 0; end < timestamps.length; end += 1) {
    while (timestamps[end]! - timestamps[start]! >= 1_000) start += 1;
    maximum = Math.max(maximum, end - start + 1);
  }
  return maximum;
};

const restoreIsWithinOnePosition = (expected: Locator, after: ReaderLocationEvent) => {
  if (resourceHref(expected.href) !== resourceHref(after.locator.href)) return false;
  const expectedPosition = expected.locations?.position;
  if (expectedPosition !== undefined && after.position !== undefined) {
    return Math.abs(expectedPosition - after.position) <= 1;
  }
  const beforeProgression = expected.locations?.totalProgression ?? expected.locations?.progression;
  const afterProgression =
    after.locator.locations?.totalProgression ?? after.locator.locations?.progression;
  return (
    beforeProgression !== undefined &&
    afterProgression !== undefined &&
    Math.abs(beforeProgression - afterProgression) <= 0.02
  );
};

export default function PerformanceSmokeApp() {
  const [fixtureUris, setFixtureUris] = useState<FixtureUris | null>(null);
  const [source, setSource] = useState<PublicationSource | null | undefined>(undefined);
  const [initialLocator, setInitialLocator] = useState<Locator | undefined>();
  const [preferences, setPreferences] = useState<ReaderPreferences>({ layout: 'scrolled' });
  const [profile, setProfile] = useState<TypographyProfile>(typographyProfile('preserve'));
  const [status, setStatus] = useState('PERFORMANCE_PREPARING');
  const [detail, setDetail] = useState('Loading deterministic fixture assets');
  const [coreReady, setCoreReady] = useState(false);
  const [scrollProbeArmed, setScrollProbeArmed] = useState(false);
  const readerRef = useRef<EpubReaderViewRef | null>(null);
  const runningRef = useRef(false);
  const readyWaitersRef = useRef<EventWaiter<ReaderReadyEvent>[]>([]);
  const readerStateWaitersRef = useRef<EventWaiter<ReaderState>[]>([]);
  const locationWaitersRef = useRef<EventWaiter<ReaderLocationEvent>[]>([]);
  const preferenceWaitersRef = useRef<EventWaiter<ReaderPreferencesStatus>[]>([]);
  const typographyWaitersRef = useRef<EventWaiter<TypographyDiagnostics>[]>([]);
  const latestReaderStateRef = useRef<ReaderState | null>(null);
  const reportRef = useRef<PerformanceReport | null>(null);
  const corePassRef = useRef(false);
  const scrollEventTimesRef = useRef<number[]>([]);
  const scrollProbeStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    Asset.loadAsync([minimalFixture, tocFixture, rtlFixture, stressFixture])
      .then(([minimal, toc, rtl, stress]) => {
        if (!active || !minimal || !toc || !rtl || !stress) return;
        setFixtureUris({
          minimal: minimal.localUri ?? minimal.uri,
          rtl: rtl.localUri ?? rtl.uri,
          stress: stress.localUri ?? stress.uri,
          toc: toc.localUri ?? toc.uri,
        });
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus('PERFORMANCE_FAIL');
          setDetail(error instanceof Error ? error.message : 'ASSET_LOAD_FAILED');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!fixtureUris || runningRef.current) return;
    runningRef.current = true;
    let activePhase = 'Initialize performance run';
    const markPhase = (phase: string) => {
      activePhase = phase;
      setDetail(phase);
    };

    const requestReady = async (nextSource: PublicationSource) => {
      const pending = waitForEvent(readyWaitersRef, () => true, 'reader ready');
      const startedAt = performance.now();
      setSource(nextSource);
      await pending;
      return roundedMilliseconds(startedAt);
    };

    const requestClosed = async () => {
      const pending = waitForEvent(
        readerStateWaitersRef,
        (state) =>
          state.state === 'idle' &&
          state.sessionDiagnostics.activeSessions === 0 &&
          state.sessionDiagnostics.ownedAssets === 0 &&
          state.sessionDiagnostics.ownedPublications === 0 &&
          state.sessionDiagnostics.sourceLeases === 0,
        'reader close'
      );
      const startedAt = performance.now();
      setSource(null);
      const state = await pending;
      return { durationMs: roundedMilliseconds(startedAt), state };
    };

    const applyPreferences = async (next: ReaderPreferences, expectedTheme: string) => {
      const pending = waitForEvent(
        preferenceWaitersRef,
        (event) => event.requested.theme === expectedTheme,
        'preference application'
      );
      const startedAt = performance.now();
      setPreferences(next);
      await pending;
      return roundedMilliseconds(startedAt);
    };

    const applyTypography = async (mode: TypographyPublisherStyleMode) => {
      const pending = waitForEvent(
        typographyWaitersRef,
        (event) => event.mode === mode,
        'typography application'
      );
      const startedAt = performance.now();
      setProfile(typographyProfile(mode));
      const diagnostics = await pending;
      return { diagnostics, durationMs: roundedMilliseconds(startedAt) };
    };

    const run = async () => {
      const startedAt = new Date().toISOString();
      const report: PerformanceReport = {
        documentType: 'native-epub-kit-performance-report',
        environment: {
          libraryVersion: 'pending',
          osVersion: String(Platform.Version),
          platform: Platform.OS as 'android' | 'ios',
          toolkitVersion: 'pending',
        },
        metrics: {},
        overallStatus: 'in-progress',
        schemaVersion: '1.0.0',
        startedAt,
      };
      reportRef.current = report;
      writeReport(report);

      if (FRAGMENT_DIAGNOSTIC_ONLY) {
        setStatus('FRAGMENT_DIAGNOSTIC_RUNNING');
        await requestReady(sourceFor(fixtureUris.stress));
        const diagnosticCommands = readerRef.current;
        if (!diagnosticCommands) throw new Error('READER_REF_MISSING');
        await diagnosticCommands.setDecorations(
          'performance.extreme',
          Array.from({ length: 2_000 }, (_, index) => stressDecoration(index + 1))
        );
        const target = stressLocator(2_000);
        let commandError: string | undefined;
        let moved = false;
        try {
          moved = await diagnosticCommands.goTo(target, { animated: false });
        } catch (error: unknown) {
          commandError = error instanceof Error ? error.message : String(error);
        }
        await wait(500);
        const current = await diagnosticCommands.getCurrentLocation();
        report.completedAt = new Date().toISOString();
        report.metrics = { fragmentDiagnostic: { commandError, current, moved, target } };
        report.overallStatus = moved ? 'passed' : 'failed';
        writeReport(report);
        setStatus('FRAGMENT_DIAGNOSTIC_DONE');
        setDetail(`moved ${moved ? 'yes' : 'no'} · ${commandError ?? 'no error'}`);
        return;
      }

      if (RESTORE_DIAGNOSTIC_ONLY) {
        setStatus('SETTLEMENT_DIAGNOSTIC_RUNNING');
        await requestReady(sourceFor(fixtureUris.stress));
        const diagnosticCommands = readerRef.current;
        if (!diagnosticCommands) throw new Error('READER_REF_MISSING');
        const page = await diagnosticCommands.getPositions({ limit: 1, offset: 174 });
        const target = page.positions[0];
        if (!target) throw new Error('RESTORE_POSITION_MISSING');
        let commandError: string | undefined;
        let moved = false;
        try {
          moved = await diagnosticCommands.goTo(target, { animated: false });
        } catch (error: unknown) {
          commandError = error instanceof Error ? error.message : String(error);
        }
        await wait(500);
        const current = await diagnosticCommands.getCurrentLocation();
        report.completedAt = new Date().toISOString();
        report.metrics = { settlementDiagnostic: { commandError, current, moved, target } };
        report.overallStatus = moved ? 'passed' : 'failed';
        writeReport(report);
        setStatus('SETTLEMENT_DIAGNOSTIC_DONE');
        setDetail(`moved ${moved ? 'yes' : 'no'} · ${commandError ?? 'no error'}`);
        return;
      }

      setStatus('PERFORMANCE_RUNNING');
      markPhase('Cold open');
      const coldOpenMs = await requestReady(sourceFor(fixtureUris.minimal));

      const commands = readerRef.current;
      if (!commands) throw new Error('READER_REF_MISSING');
      const diagnostics = await commands.getDiagnostics();
      report.environment = {
        libraryVersion: diagnostics.sdk.version,
        osVersion: String(Platform.Version),
        platform: Platform.OS as 'android' | 'ios',
        toolkitRevision: diagnostics.toolkit.revision,
        toolkitVersion: `${diagnostics.toolkit.name}@${diagnostics.toolkit.version}`,
      };

      markPhase('Twenty warm reopen and close samples');
      const closeSamples: number[] = [];
      const warmOpenSamples: number[] = [];
      let memoryAfterTwenty: PublicationSessionDiagnostics | undefined;
      for (let index = 0; index < 20; index += 1) {
        const closed = await requestClosed();
        closeSamples.push(closed.durationMs);
        if (index === 19) memoryAfterTwenty = closed.state.sessionDiagnostics;
        warmOpenSamples.push(await requestReady(sourceFor(fixtureUris.minimal)));
      }

      markPhase('Public data bridge');
      const publicationBridgeSamples: number[] = [];
      for (let index = 0; index < 10; index += 1) {
        const bridgeStartedAt = performance.now();
        await Promise.all([commands.getPublication(), commands.getPositions({ limit: 256 })]);
        publicationBridgeSamples.push(roundedMilliseconds(bridgeStartedAt));
      }

      markPhase('Direct source replacement');
      const replacementSamples: number[] = [];
      const replacementUris = [
        fixtureUris.toc,
        fixtureUris.rtl,
        fixtureUris.minimal,
        fixtureUris.toc,
        fixtureUris.rtl,
        fixtureUris.minimal,
        fixtureUris.toc,
        fixtureUris.rtl,
        fixtureUris.minimal,
        fixtureUris.rtl,
      ];
      for (const uri of replacementUris) {
        replacementSamples.push(await requestReady(sourceFor(uri)));
      }

      markPhase('Native preferences and typography');
      const preferenceSamples: number[] = [];
      for (let index = 0; index < 10; index += 1) {
        const theme = index % 2 === 0 ? 'dark' : 'sepia';
        preferenceSamples.push(
          await applyPreferences(
            {
              fontSize: index % 2 === 0 ? 1.25 : 1.1,
              layout: 'scrolled',
              publisherStyles: false,
              theme,
            },
            theme
          )
        );
      }
      const typographySamples: number[] = [];
      let typographyHealthy = true;
      for (const mode of [
        'hybrid',
        'override',
        'preserve',
        'hybrid',
        'override',
        'preserve',
      ] as const) {
        const result = await applyTypography(mode);
        typographySamples.push(result.durationMs);
        typographyHealthy &&=
          result.diagnostics.fontLoaded && result.diagnostics.locatorStableDuringProbe;
      }

      markPhase('Representative and extreme decorations');
      await requestReady(sourceFor(fixtureUris.stress));
      const representativeDecorations = Array.from({ length: 500 }, (_, index) =>
        stressDecoration(index + 1)
      );
      const representativeStartedAt = performance.now();
      await commands.setDecorations('performance.representative', representativeDecorations);
      const representativeApplyMs = roundedMilliseconds(representativeStartedAt);
      const representativeClearStartedAt = performance.now();
      await commands.setDecorations('performance.representative', []);
      const representativeClearMs = roundedMilliseconds(representativeClearStartedAt);

      const extremeDecorations = Array.from({ length: 2_000 }, (_, index) =>
        stressDecoration(index + 1)
      );
      const extremeStartedAt = performance.now();
      await commands.setDecorations('performance.extreme', extremeDecorations);
      const extremeApplyMs = roundedMilliseconds(extremeStartedAt);
      markPhase('Extreme-decoration navigation to final anchor');
      const extremeNavigationStartedAt = performance.now();
      const extremeEndTarget = stressLocator(2_000);
      let movedToEnd = false;
      try {
        movedToEnd = await commands.goTo(extremeEndTarget, { animated: false });
      } catch (error: unknown) {
        report.metrics = {
          extremeNavigationFailure: {
            current: await commands.getCurrentLocation(),
            target: extremeEndTarget,
          },
        };
        writeReport(report);
        throw error;
      }
      await wait(350);
      markPhase('Extreme-decoration navigation to initial anchor');
      const movedToStart = await commands.goTo(stressLocator(1), { animated: false });
      await wait(350);
      const extremeNavigationMs = roundedMilliseconds(extremeNavigationStartedAt);
      const extremeClearStartedAt = performance.now();
      await commands.setDecorations('performance.extreme', []);
      const extremeClearMs = roundedMilliseconds(extremeClearStartedAt);

      markPhase('Bounded 2,000-result native search');
      const searchStartedAt = performance.now();
      const searchSession = await commands.search('Addressable paragraph', { pageSize: 100 });
      const search = await readCompleteSearch(commands, searchSession);
      await commands.cancelSearch(searchSession.id);
      const searchMs = roundedMilliseconds(searchStartedAt);

      markPhase('Canonical locator restore');
      const restorePositions = await commands.getPositions({ limit: 1, offset: 174 });
      const restoreTarget = restorePositions.positions[0];
      if (!restoreTarget) throw new Error('RESTORE_POSITION_MISSING');
      const restoreSource = await commands.getCurrentLocation();
      let movedToRestoreTarget = false;
      try {
        movedToRestoreTarget = await commands.goTo(restoreTarget, { animated: false });
      } catch (error: unknown) {
        await wait(500);
        report.metrics = {
          restoreNavigationFailure: {
            current: await commands.getCurrentLocation(),
            source: restoreSource,
            target: restoreTarget,
          },
        };
        writeReport(report);
        throw error;
      }
      if (!movedToRestoreTarget) throw new Error('RESTORE_TARGET_UNREACHABLE');
      await wait(500);
      const beforeRestore = await commands.getCurrentLocation();
      if (!beforeRestore) throw new Error('RESTORE_ANCHOR_MISSING');
      await requestClosed();
      setInitialLocator(restoreTarget);
      await wait(100);
      const restoredLocation = waitForEvent(
        locationWaitersRef,
        (event) => event.reason === 'restored',
        'restored location'
      );
      const restoreOpenMs = await requestReady(sourceFor(fixtureUris.stress));
      const afterRestore = await restoredLocation;
      const restoreWithinOnePosition = restoreIsWithinOnePosition(restoreTarget, afterRestore);

      markPhase('Preparing representative scroll-event probe');
      setInitialLocator(undefined);
      await wait(100);
      await requestReady(sourceFor(fixtureUris.minimal));
      await applyPreferences(
        { fontSize: 1.15, layout: 'scrolled', publisherStyles: false, theme: 'dark' },
        'dark'
      );
      await wait(300);

      const warmOpen = summarize(warmOpenSamples);
      const memoryPass =
        memoryAfterTwenty?.postWarmupMemoryIsBounded === true &&
        memoryAfterTwenty.activeSessions === 0 &&
        memoryAfterTwenty.ownedAssets === 0 &&
        memoryAfterTwenty.ownedPublications === 0 &&
        memoryAfterTwenty.sourceLeases === 0 &&
        memoryAfterTwenty.forcedReleaseViolations === 0;
      const corePass =
        coldOpenMs < 3_000 &&
        warmOpen.p95Ms < 1_500 &&
        memoryPass &&
        typographyHealthy &&
        movedToEnd &&
        movedToStart &&
        search.resultCount === 2_000 &&
        search.pageCount === 20 &&
        search.truncated &&
        restoreWithinOnePosition;

      report.metrics = {
        coldOpen: { durationMs: coldOpenMs, pass: coldOpenMs < 3_000, targetMs: 3_000 },
        close: summarize(closeSamples),
        warmReopen: { ...warmOpen, pass: warmOpen.p95Ms < 1_500, targetP95Ms: 1_500 },
        publicationBridge: summarize(publicationBridgeSamples),
        sourceReplacement: summarize(replacementSamples),
        preferences: summarize(preferenceSamples),
        typography: { ...summarize(typographySamples), fontAndLocatorHealthy: typographyHealthy },
        decorations: {
          extreme: {
            applyMs: extremeApplyMs,
            cleanupMs: extremeClearMs,
            count: 2_000,
            navigationMs: extremeNavigationMs,
            navigationUsable: movedToEnd && movedToStart,
            tier: 'B',
          },
          representative: {
            applyMs: representativeApplyMs,
            cleanupMs: representativeClearMs,
            count: 500,
            tier: 'A',
          },
        },
        memoryAfterTwenty,
        restore: {
          openMs: restoreOpenMs,
          pass: restoreWithinOnePosition,
          positionAfter: afterRestore.position,
          positionBefore: beforeRestore.position,
          positionExpected: restoreTarget.locations?.position,
          target: 'within-one-position',
        },
        search: { ...search, durationMs: searchMs, pass: search.resultCount === 2_000 },
        scrollEvents: {
          fixture: 'minimal-en',
          status: 'awaiting-real-gestures',
          targetMaximumPerSecond: 10,
        },
      };
      reportRef.current = report;
      corePassRef.current = corePass;
      writeReport(report);
      setCoreReady(true);
      setStatus(corePass ? 'PERFORMANCE_CORE_READY' : 'PERFORMANCE_CORE_FAIL');
      setDetail(
        `cold ${coldOpenMs}ms · warm P95 ${warmOpen.p95Ms}ms · replace P95 ${summarize(replacementSamples).p95Ms}ms · search ${searchMs}ms · arm scroll probe`
      );
    };

    run().catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error('PERFORMANCE_DRIVER_FAILED');
      const report = reportRef.current;
      if (report) {
        report.completedAt = new Date().toISOString();
        report.error = failure.message;
        report.errorPhase = activePhase;
        report.overallStatus = 'failed';
        writeReport(report);
      }
      rejectWaiters(readyWaitersRef, failure);
      rejectWaiters(readerStateWaitersRef, failure);
      rejectWaiters(locationWaitersRef, failure);
      rejectWaiters(preferenceWaitersRef, failure);
      rejectWaiters(typographyWaitersRef, failure);
      setStatus('PERFORMANCE_FAIL');
      setDetail(failure.message);
    });
  }, [fixtureUris]);

  const armScrollProbe = () => {
    scrollEventTimesRef.current = [];
    scrollProbeStartedAtRef.current = performance.now();
    setScrollProbeArmed(true);
    setStatus('PERFORMANCE_SCROLL_ARMED');
    setDetail('Perform repeated vertical swipes in the reader, then finish the probe');
  };

  const finishScrollProbe = () => {
    const report = reportRef.current;
    const startedAt = scrollProbeStartedAtRef.current;
    if (!report || startedAt === null) {
      setStatus('PERFORMANCE_FAIL');
      setDetail('SCROLL_PROBE_NOT_ARMED');
      return;
    }
    const timestamps = scrollEventTimesRef.current;
    const summary: EventRateSummary = {
      durationMs: roundedMilliseconds(startedAt),
      eventCount: timestamps.length,
      maximumEventsPerSecond: maximumEventsPerSecond(timestamps),
      pass: timestamps.length > 0 && maximumEventsPerSecond(timestamps) <= 10,
    };
    report.metrics.scrollEvents = {
      ...summary,
      fixture: 'minimal-en',
      targetMaximumPerSecond: 10,
    };
    report.completedAt = new Date().toISOString();
    report.overallStatus = corePassRef.current && summary.pass ? 'passed' : 'failed';
    writeReport(report);
    setScrollProbeArmed(false);
    setStatus(report.overallStatus === 'passed' ? 'PERFORMANCE_PASS' : 'PERFORMANCE_FAIL');
    setDetail(
      `scroll events ${summary.eventCount} · max ${summary.maximumEventsPerSecond}/s · report ${REPORT_FILE_NAME}`
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Native EPUB Kit performance</Text>
        <Text selectable testID="performance-status" style={styles.status}>
          {status}
        </Text>
        <Text numberOfLines={2} selectable testID="performance-detail" style={styles.detail}>
          {detail}
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={!coreReady || scrollProbeArmed}
            onPress={armScrollProbe}
            style={[styles.button, (!coreReady || scrollProbeArmed) && styles.buttonDisabled]}
            testID="arm-scroll-performance"
          >
            <Text style={styles.buttonText}>Arm scroll probe</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!scrollProbeArmed}
            onPress={finishScrollProbe}
            style={[styles.button, !scrollProbeArmed && styles.buttonDisabled]}
            testID="finish-scroll-performance"
          >
            <Text style={styles.buttonText}>Finish scroll probe</Text>
          </Pressable>
        </View>
      </View>
      <EpubReaderView
        chapterGranularity="top-level"
        initialLocator={initialLocator}
        onError={(event) => {
          const error = new Error(`${event.error.code}/${event.error.phase}`);
          rejectWaiters(readyWaitersRef, error);
        }}
        onLocationChange={(event) => {
          emitEvent(locationWaitersRef, event);
          if (scrollProbeArmed && event.reason === 'user-scroll') {
            scrollEventTimesRef.current.push(performance.now());
          }
        }}
        onPreferencesChange={(event) => emitEvent(preferenceWaitersRef, event)}
        onReady={(event) => emitEvent(readyWaitersRef, event)}
        ref={readerRef}
        preferences={preferences}
        source={source}
        style={styles.reader}
        testID="performance-reader"
        typographyProfile={profile}
        unstable_qualification={{
          onReaderState: (event) => {
            latestReaderStateRef.current = event.nativeEvent;
            emitEvent(readerStateWaitersRef, event.nativeEvent);
          },
          onTypographyDiagnostics: (event) => emitEvent(typographyWaitersRef, event.nativeEvent),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8 },
  button: {
    backgroundColor: '#002a50',
    borderRadius: 8,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  detail: { color: '#35516c', fontSize: 12, lineHeight: 16 },
  header: {
    backgroundColor: '#f4ecd8',
    borderBottomColor: '#d9cba9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 48,
  },
  reader: { flex: 1 },
  screen: { backgroundColor: '#ffffff', flex: 1 },
  status: { color: '#7a4f11', fontSize: 13, fontWeight: '700' },
  title: { color: '#002a50', fontSize: 19, fontWeight: '700' },
});
