import { File as ExpoFile, Paths } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import {
  EpubReaderView,
  isReaderProgressLocationEvent,
  type EpubReaderViewRef,
  type PublicationInfo,
  type ReaderDiagnostics,
  type ReaderErrorEvent,
  type ReaderLocationEvent,
  type ReaderState,
} from 'native-epub-kit';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

type DriverPlatform = 'ios' | 'android';
type StageStatus = 'passed' | 'failed' | 'blocked' | 'skipped' | 'timeout';

interface NativeCommand {
  documentType: 'reader-native-command';
  platform: DriverPlatform;
  publicationId: string;
  resumeToken: string;
  runId: string;
  schemaVersion: '1.0.0';
  sourceRef: {
    kind: 'private-cache' | 'public-fixture';
    relativePath: string;
  };
  steps: readonly { id: string; method: string; progression?: number }[];
  timeouts: { actionMs: number; closeMs: number; openMs: number };
}

interface StageResult {
  [key: string]: boolean | number | StageStatus | string | undefined;
  status: StageStatus;
}

interface NativeResult {
  close: StageResult;
  documentType: 'reader-native-result';
  environment: {
    appVersion: string;
    libraryVersion: string;
    toolkitRevision?: string;
    toolkitVersion: string;
  };
  errors: { code: string; stage: string }[];
  finishedAt: string;
  navigation: StageResult[];
  open: StageResult;
  platform: DriverPlatform;
  progress: StageResult;
  publication: StageResult;
  publicationId: string;
  resumeToken: string;
  runId: string;
  schemaVersion: '1.0.0';
  screenshotPath: null;
  startedAt: string;
  status: 'passed' | 'failed';
}

const expectedMethods = [
  'mountSourceAndWaitReady',
  'getPublication',
  'getPositions',
  'goToProgression',
  'goToProgression',
  'goToProgression',
  'clearSourceAndWaitIdle',
] as const;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const tocCount = (publication: PublicationInfo) => {
  let count = 0;
  const visit = (links: PublicationInfo['tableOfContents']) => {
    for (const link of links) {
      count += 1;
      visit(link.children);
    }
  };
  visit(publication.tableOfContents);
  return count;
};

const overallProgress = (location: ReaderLocationEvent) => {
  if (isReaderProgressLocationEvent(location)) return location.overallProgress;
  return (
    location.locator.locations?.totalProgression ?? location.locator.locations?.progression ?? 0
  );
};

const locatorIdentity = (location: ReaderLocationEvent | null) =>
  location
    ? JSON.stringify({
        href: location.locator.href,
        locations: location.locator.locations,
      })
    : null;

const waitForNavigationSettlement = async (
  reader: EpubReaderViewRef,
  previousIdentity: string | null,
  requireMovement: boolean,
  timeoutMs: number
) => {
  const deadline = performance.now() + timeoutMs;
  let location = await reader.getCurrentLocation();
  while (
    (!location || (requireMovement && locatorIdentity(location) === previousIdentity)) &&
    performance.now() < deadline
  ) {
    await wait(200);
    location = await reader.getCurrentLocation();
  }
  return {
    location,
    settled:
      Boolean(location) && (!requireMovement || locatorIdentity(location) !== previousIdentity),
  };
};

const parseCommand = (value: unknown): NativeCommand => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_COMMAND');
  }
  const command = value as Partial<NativeCommand>;
  if (
    command.documentType !== 'reader-native-command' ||
    command.schemaVersion !== '1.0.0' ||
    !['ios', 'android'].includes(command.platform ?? '') ||
    typeof command.runId !== 'string' ||
    typeof command.publicationId !== 'string' ||
    typeof command.resumeToken !== 'string' ||
    !command.sourceRef ||
    !['private-cache', 'public-fixture'].includes(command.sourceRef.kind) ||
    typeof command.sourceRef.relativePath !== 'string' ||
    command.sourceRef.relativePath.includes('..') ||
    command.sourceRef.relativePath.startsWith('/') ||
    !command.sourceRef.relativePath.endsWith('.epub') ||
    !Array.isArray(command.steps) ||
    command.steps.length !== expectedMethods.length ||
    command.steps.some((step, index) => step.method !== expectedMethods[index])
  ) {
    throw new Error('INVALID_COMMAND');
  }
  if (command.platform !== Platform.OS) throw new Error('PLATFORM_MISMATCH');
  return command as NativeCommand;
};

const resultFiles = () => ({
  command: new ExpoFile(Paths.document, 'reader-native-command.json'),
  result: new ExpoFile(Paths.document, 'reader-native-result.json'),
  source: new ExpoFile(Paths.document, 'reader-corpus-source.epub'),
});

export default function CorpusSmokeApp() {
  const [command, setCommand] = useState<NativeCommand | null>(null);
  const [sourceActive, setSourceActive] = useState(false);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [status, setStatus] = useState('Loading corpus command');
  const readerRef = useRef<EpubReaderViewRef | null>(null);
  const openStartedRef = useRef<number | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const releaseResolverRef = useRef<((released: boolean) => void) | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const files = resultFiles();
      if (files.result.exists) files.result.delete();
      if (!files.command.exists || !files.source.exists) throw new Error('INPUT_MISSING');
      const nextCommand = parseCommand(JSON.parse(await files.command.text()));
      if (!active) return;
      startedAtRef.current = new Date().toISOString();
      openStartedRef.current = performance.now();
      setCommand(nextCommand);
      setSourceActive(true);
      setStatus(`Opening ${nextCommand.publicationId}`);
    };
    load().catch((error: unknown) => {
      if (active) setStatus(error instanceof Error ? error.message : 'INPUT_FAILED');
    });
    return () => {
      active = false;
    };
  }, []);

  const writeResult = (result: NativeResult) => {
    const file = resultFiles().result;
    file.write(`${JSON.stringify(result, null, 2)}\n`);
    finishedRef.current = true;
    setStatus(result.status === 'passed' ? 'Corpus smoke passed' : 'Corpus smoke failed');
  };

  const environment = (diagnostics?: ReaderDiagnostics): NativeResult['environment'] => ({
    appVersion: '0.0.0',
    libraryVersion: diagnostics?.sdk.version ?? '0.1.0',
    toolkitVersion: diagnostics
      ? `${diagnostics.toolkit.name}@${diagnostics.toolkit.version}`
      : 'unknown-before-ready',
    ...(diagnostics ? { toolkitRevision: diagnostics.toolkit.revision } : {}),
  });

  const fail = (
    nextCommand: NativeCommand,
    code: string,
    stage: string,
    partial?: Partial<NativeResult>
  ) => {
    if (finishedRef.current) return;
    setSourceActive(false);
    writeResult({
      close: { status: 'skipped', resourcesReleased: false },
      documentType: 'reader-native-result',
      environment: environment(),
      errors: [{ code, stage }],
      finishedAt: new Date().toISOString(),
      navigation: [],
      open: { status: stage === 'open' ? 'failed' : 'passed', ready: stage !== 'open' },
      platform: nextCommand.platform,
      progress: { status: 'skipped', moved: false },
      publication: { status: stage === 'publication' ? 'failed' : 'skipped' },
      publicationId: nextCommand.publicationId,
      resumeToken: nextCommand.resumeToken,
      runId: nextCommand.runId,
      schemaVersion: '1.0.0',
      screenshotPath: null,
      startedAt: startedAtRef.current ?? new Date().toISOString(),
      status: 'failed',
      ...partial,
    });
  };

  useEffect(() => {
    if (!command || readyAt === null || runningRef.current || finishedRef.current) return;
    runningRef.current = true;

    const run = async () => {
      const reader = readerRef.current;
      if (!reader) throw new Error('READER_REF_MISSING');
      const openDurationMs = Math.max(0, Math.round(readyAt - (openStartedRef.current ?? readyAt)));
      setStatus('Inspecting publication');
      const [publication, positions, diagnostics] = await Promise.all([
        reader.getPublication(),
        reader.getPositions({ limit: 256, offset: 0 }),
        reader.getDiagnostics(),
      ]);
      const publicationStage: StageResult = {
        layout: publication.layout,
        lastPositionProgression:
          positions.positions.at(-1)?.locations?.totalProgression ?? undefined,
        middlePositionProgression:
          positions.positions[Math.floor(positions.positions.length / 2)]?.locations
            ?.totalProgression,
        positionCount: positions.total,
        readingProgression: publication.readingProgression ?? 'auto',
        status: 'passed',
        tocCount: tocCount(publication),
      };

      const navigation: StageResult[] = [];
      for (const [id, target] of [
        ['beginning', 0],
        ['middle', 0.5],
        ['near-end', 0.95],
      ] as const) {
        setStatus(`Navigating ${id}`);
        const previousIdentity = locatorIdentity(await reader.getCurrentLocation());
        const commandMoved = await reader.goToProgression(target, {
          animated: false,
          history: 'ignore',
        });
        const { location, settled } = await waitForNavigationSettlement(
          reader,
          previousIdentity,
          id !== 'beginning',
          command.timeouts.actionMs
        );
        if (!location) throw new Error('NAVIGATION_LOCATION_MISSING');
        const resourceOrdinal = publication.readingOrder.findIndex(
          (link) => link.href.split('#')[0] === location.locator.href.split('#')[0]
        );
        navigation.push({
          commandMoved,
          id,
          locatorProgression: location.locator.locations?.progression,
          locatorTotalProgression: location.locator.locations?.totalProgression,
          locationObserved: true,
          overallProgress: overallProgress(location),
          position: location.position ?? location.locator.locations?.position,
          resourceOrdinal,
          settled,
          status: 'passed',
        });
      }

      const values = navigation.map((probe) => Number(probe.overallProgress));
      const moved = Math.max(...values) - Math.min(...values) >= 0.25;
      if (!moved) {
        const fallbackPosition = Math.max(1, Math.round((positions.total + 1) / 2));
        const positionFallbackMoved = await reader.goToPosition(fallbackPosition, {
          animated: false,
          history: 'ignore',
        });
        await wait(650);
        const fallbackLocation = await reader.getCurrentLocation();
        const fallbackLink =
          publication.readingOrder[Math.floor(publication.readingOrder.length / 2)];
        const linkFallbackMoved = fallbackLink
          ? await reader.goTo(fallbackLink, { animated: false, history: 'ignore' })
          : false;
        const linkFallbackSettlement = await waitForNavigationSettlement(
          reader,
          locatorIdentity(fallbackLocation),
          true,
          command.timeouts.actionMs
        );
        fail(command, 'PROGRESS_DID_NOT_MOVE', 'progress', {
          navigation,
          progress: {
            moved: false,
            linkFallbackMoved,
            linkFallbackOverallProgress: linkFallbackSettlement.location
              ? overallProgress(linkFallbackSettlement.location)
              : undefined,
            linkFallbackSettled: linkFallbackSettlement.settled,
            positionFallbackMoved,
            positionFallbackOverallProgress: fallbackLocation
              ? overallProgress(fallbackLocation)
              : undefined,
            positionFallbackPosition:
              fallbackLocation?.position ?? fallbackLocation?.locator.locations?.position,
            status: 'failed',
          },
          publication: publicationStage,
        });
        return;
      }

      setStatus('Closing publication');
      const closeStarted = performance.now();
      const released = new Promise<boolean>((resolve) => {
        releaseResolverRef.current = resolve;
      });
      setSourceActive(false);
      const resourcesReleased = await Promise.race([
        released,
        wait(command.timeouts.closeMs).then(() => false),
      ]);
      releaseResolverRef.current = null;
      if (!resourcesReleased) throw new Error('CLOSE_TIMEOUT');

      writeResult({
        close: {
          durationMs: Math.max(0, Math.round(performance.now() - closeStarted)),
          resourcesReleased: true,
          status: 'passed',
        },
        documentType: 'reader-native-result',
        environment: environment(diagnostics),
        errors: [],
        finishedAt: new Date().toISOString(),
        navigation,
        open: { durationMs: openDurationMs, ready: true, status: 'passed' },
        platform: command.platform,
        progress: {
          moved: true,
          precision: diagnostics.publication.progressPrecision,
          status: 'passed',
        },
        publication: publicationStage,
        publicationId: command.publicationId,
        resumeToken: command.resumeToken,
        runId: command.runId,
        schemaVersion: '1.0.0',
        screenshotPath: null,
        startedAt: startedAtRef.current ?? new Date().toISOString(),
        status: 'passed',
      });
    };

    run().catch((error: unknown) => {
      const code = error instanceof Error ? error.message : 'CORPUS_DRIVER_FAILED';
      fail(command, /^[A-Z][A-Z0-9_]+$/.test(code) ? code : 'CORPUS_DRIVER_FAILED', 'driver');
    });
  }, [command, readyAt]);

  const handleOpenError = (event: ReaderErrorEvent) => {
    if (!command || runningRef.current || finishedRef.current) return;
    fail(command, event.error.code, 'open');
  };

  const handleQualificationState = (state: ReaderState) => {
    if (
      (state.state === 'idle' || state.state === 'unmounted') &&
      state.sessionDiagnostics.activeSessions === 0 &&
      state.sessionDiagnostics.ownedAssets === 0 &&
      state.sessionDiagnostics.ownedPublications === 0 &&
      state.sessionDiagnostics.sourceLeases === 0
    ) {
      releaseResolverRef.current?.(true);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Native corpus smoke</Text>
        <Text testID="corpus-smoke-status" style={styles.status}>
          {status}
        </Text>
      </View>
      <EpubReaderView
        chapterGranularity="top-level"
        onError={handleOpenError}
        onLocationChange={() => undefined}
        onReady={() => setReadyAt(performance.now())}
        ref={readerRef}
        source={sourceActive ? { kind: 'file', uri: resultFiles().source.uri } : null}
        style={styles.reader}
        testID="corpus-smoke-reader"
        unstable_qualification={{
          onReaderState: (event) => handleQualificationState(event.nativeEvent),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#f4ecd8',
    borderBottomColor: '#d9cba9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 54,
  },
  reader: { flex: 1 },
  screen: { backgroundColor: '#ffffff', flex: 1 },
  status: { color: '#35516c', fontSize: 13 },
  title: { color: '#002a50', fontSize: 20, fontWeight: '700' },
});
