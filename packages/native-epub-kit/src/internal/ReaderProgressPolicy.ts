import {
  parseLocator,
  parseNavigationUnit,
  parseReaderLocationEvent,
} from '../recordValidation.ts';
import type {
  Locator,
  NavigationUnit,
  NavigationUnitDerivationResult,
  ProgressPrecision,
  ReaderLocationEvent,
  ReaderProgressCheckpoint,
  ReaderProgressControllerState,
  ReaderProgressLocationEvent,
  ReaderProgressStabilityOptions,
} from '../records.ts';
import {
  normalizeNavigationResourceHref,
  normalizeNavigationTargetHref,
} from './NavigationUnitPolicy.ts';

const progressionEpsilon = 1e-9;
const precisionRank: Record<ProgressPrecision, number> = {
  continuous: 2,
  position: 1,
  resource: 0,
};

interface UnitSelection {
  index: number;
  unit: NavigationUnit;
}

interface ProgressValue {
  precision: ProgressPrecision;
  value: number;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function leastPrecise(...precisions: ProgressPrecision[]): ProgressPrecision {
  return precisions.reduce((least, value) =>
    precisionRank[value] < precisionRank[least] ? value : least
  );
}

function anchorTarget(locator: Locator): string {
  const resource = normalizeNavigationResourceHref(locator.href);
  const fragment = locator.locations?.fragments?.[0];
  return fragment ? normalizeNavigationTargetHref(`${resource}#${fragment}`) : resource;
}

function resourceOrdinal(
  navigation: NavigationUnitDerivationResult,
  href: string
): number | undefined {
  const resource = normalizeNavigationResourceHref(href);
  const index = navigation.resources.findIndex((entry) => entry.href === resource);
  return index < 0 ? undefined : index;
}

function resourceScalar(
  navigation: NavigationUnitDerivationResult,
  locator: Locator
): number | undefined {
  const index = resourceOrdinal(navigation, locator.href);
  if (index === undefined) return undefined;
  return index + clampProgress(locator.locations?.progression ?? 0);
}

function unitResourceScalar(
  navigation: NavigationUnitDerivationResult,
  locator: Locator | undefined,
  publicationEnd: boolean
): number | undefined {
  if (!locator) return publicationEnd ? navigation.resources.length : undefined;
  return resourceScalar(navigation, locator);
}

function exactTargetSelection(
  locationAnchor: Locator,
  units: readonly NavigationUnit[]
): UnitSelection | undefined {
  if ((locationAnchor.locations?.fragments?.length ?? 0) === 0) return undefined;
  const target = anchorTarget(locationAnchor);
  const index = units.findIndex((unit) => normalizeNavigationTargetHref(unit.href) === target);
  return index < 0 ? undefined : { index, unit: units[index]! };
}

function selectByContinuousProgress(
  value: number,
  units: readonly NavigationUnit[]
): UnitSelection | undefined {
  const exactStarts = units
    .map((unit, index) => ({ index, unit }))
    .filter(
      ({ unit }) =>
        unit.startTotalProgression !== undefined &&
        Math.abs(unit.startTotalProgression - value) <= progressionEpsilon
    );
  if (exactStarts.length > 0) return exactStarts[0];

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]!;
    const start = unit.startTotalProgression;
    const end = unit.endTotalProgression;
    if (start === undefined || end === undefined || end <= start) continue;
    const atPublicationEnd =
      index === units.length - 1 && Math.abs(value - 1) <= progressionEpsilon;
    if (value >= start && (value < end || atPublicationEnd)) return { index, unit };
  }
  return undefined;
}

function selectByPosition(
  position: number,
  units: readonly NavigationUnit[]
): UnitSelection | undefined {
  const exactStarts = units
    .map((unit, index) => ({ index, unit }))
    .filter(({ unit }) => unit.startPosition === position);
  if (exactStarts.length > 0) return exactStarts[0];

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]!;
    if (
      unit.startPosition !== undefined &&
      unit.endPositionExclusive !== undefined &&
      position >= unit.startPosition &&
      position < unit.endPositionExclusive
    ) {
      return { index, unit };
    }
  }
  return undefined;
}

function selectByResource(
  anchor: Locator,
  navigation: NavigationUnitDerivationResult
): UnitSelection | undefined {
  const anchorValue = resourceScalar(navigation, anchor);
  if (anchorValue === undefined) return undefined;
  const exactStarts = navigation.units
    .map((unit, index) => ({
      index,
      start: unitResourceScalar(navigation, unit.startLocator, false),
      unit,
    }))
    .filter(
      (candidate) =>
        candidate.start !== undefined &&
        Math.abs(candidate.start - anchorValue) <= progressionEpsilon
    );
  if (exactStarts.length > 0) return exactStarts[0];

  let lastBefore: UnitSelection | undefined;
  for (let index = 0; index < navigation.units.length; index += 1) {
    const unit = navigation.units[index]!;
    const start = unitResourceScalar(navigation, unit.startLocator, false);
    const end = unitResourceScalar(
      navigation,
      unit.endLocator,
      index === navigation.units.length - 1
    );
    if (start === undefined) continue;
    if (anchorValue >= start) lastBefore = { index, unit };
    const atPublicationEnd =
      index === navigation.units.length - 1 &&
      Math.abs(anchorValue - navigation.resources.length) <= progressionEpsilon;
    if (
      end !== undefined &&
      end > start &&
      anchorValue >= start &&
      (anchorValue < end || atPublicationEnd)
    ) {
      return { index, unit };
    }
  }
  return lastBefore ?? (navigation.units[0] ? { index: 0, unit: navigation.units[0] } : undefined);
}

function deriveOverallProgress(
  location: ReaderLocationEvent,
  anchor: Locator,
  navigation: NavigationUnitDerivationResult,
  position: number | undefined,
  totalPositions: number | undefined
): ProgressValue {
  // The locator is the canonical reading checkpoint. A native viewport aggregate
  // can briefly lag a completed programmatic jump, so never let that aggregate
  // replace a newer total progression carried by the checkpoint itself.
  if (anchor.locations?.totalProgression !== undefined) {
    return { precision: location.precision, value: anchor.locations.totalProgression };
  }
  if (location.overallProgress !== undefined) {
    return { precision: location.precision, value: location.overallProgress };
  }
  if (position !== undefined && totalPositions !== undefined && totalPositions > 0) {
    return {
      precision: leastPrecise(location.precision, 'position'),
      value: clampProgress((position - 1) / totalPositions),
    };
  }
  const scalar = resourceScalar(navigation, anchor) ?? 0;
  return {
    precision: 'resource',
    value: clampProgress(
      navigation.resources.length === 0 ? 0 : scalar / navigation.resources.length
    ),
  };
}

function deriveChapterProgress(
  location: ReaderLocationEvent,
  anchor: Locator,
  navigation: NavigationUnitDerivationResult,
  unit: NavigationUnit,
  overall: number,
  position: number | undefined
): ProgressValue {
  if (navigation.units.at(-1)?.id === unit.id && overall >= 1 - progressionEpsilon) {
    return { precision: location.precision, value: 1 };
  }
  if (
    location.precision === 'continuous' &&
    !navigation.units.some(
      (candidate) =>
        candidate.id !== unit.id &&
        candidate.startTotalProgression !== undefined &&
        unit.startTotalProgression !== undefined &&
        Math.abs(candidate.startTotalProgression - unit.startTotalProgression) <= progressionEpsilon
    ) &&
    unit.startTotalProgression !== undefined &&
    unit.endTotalProgression !== undefined &&
    unit.endTotalProgression > unit.startTotalProgression
  ) {
    return {
      precision: 'continuous',
      value: clampProgress(
        (overall - unit.startTotalProgression) /
          (unit.endTotalProgression - unit.startTotalProgression)
      ),
    };
  }
  if (
    precisionRank[location.precision] >= precisionRank.position &&
    !navigation.units.some(
      (candidate) =>
        candidate.id !== unit.id &&
        candidate.startPosition !== undefined &&
        candidate.startPosition === unit.startPosition
    ) &&
    position !== undefined &&
    unit.startPosition !== undefined &&
    unit.endPositionExclusive !== undefined &&
    unit.endPositionExclusive > unit.startPosition
  ) {
    return {
      precision: 'position',
      value: clampProgress(
        (position - unit.startPosition) / (unit.endPositionExclusive - unit.startPosition)
      ),
    };
  }
  const anchorValue = resourceScalar(navigation, anchor);
  const start = unitResourceScalar(navigation, unit.startLocator, false);
  const end = unitResourceScalar(
    navigation,
    unit.endLocator,
    navigation.units.at(-1)?.id === unit.id
  );
  const sharesCoarseStart = navigation.units.some((candidate) => {
    if (candidate.id === unit.id || start === undefined) return false;
    const candidateStart = unitResourceScalar(navigation, candidate.startLocator, false);
    return candidateStart !== undefined && Math.abs(candidateStart - start) <= progressionEpsilon;
  });
  return {
    precision: 'resource',
    value:
      sharesCoarseStart ||
      anchorValue === undefined ||
      start === undefined ||
      end === undefined ||
      end <= start
        ? 0
        : clampProgress((anchorValue - start) / (end - start)),
  };
}

/**
 * The share of the publication visible on screen, when the native view reports the
 * bottom of the viewport in the same resource as its top.
 */
function visibleSpan(
  location: ReaderLocationEvent,
  anchor: Locator,
  navigation: NavigationUnitDerivationResult
): number | undefined {
  const end = location.visibleRange?.end;
  if (!end) return undefined;
  const resource = normalizeNavigationResourceHref(anchor.href);
  if (normalizeNavigationResourceHref(end.href) !== resource) return undefined;
  const top = anchor.locations?.totalProgression;
  const bottom = end.locations?.totalProgression;
  let span: number | undefined;
  if (top !== undefined && bottom !== undefined) {
    span = bottom - top;
  } else {
    // Scale the resource-local span by the resource's share of the publication.
    const interval = navigation.resources.find((entry) => entry.href === resource);
    const topLocal = anchor.locations?.progression;
    const bottomLocal = end.locations?.progression;
    if (
      interval?.startTotalProgression !== undefined &&
      interval.endTotalProgression !== undefined &&
      topLocal !== undefined &&
      bottomLocal !== undefined
    ) {
      span =
        (bottomLocal - topLocal) * (interval.endTotalProgression - interval.startTotalProgression);
    }
  }
  return span !== undefined && Number.isFinite(span) && span > 0 ? Math.min(1, span) : undefined;
}

/**
 * Locators mark the top of the viewport, which can never reach the end of a chapter or
 * book. Measure against the scrollable range instead: 0 at the very top, 1 when the
 * bottom of the viewport reaches the end, and linear in between.
 */
function scrollableRangeProgress(
  top: number,
  screen: number,
  unit: NavigationUnitDerivationResult['units'][number],
  chapterPrecision: ProgressPrecision
): { chapter?: number; overall: number } {
  const range = (start: number, end: number) => {
    const scrollable = end - start - screen;
    if (scrollable <= progressionEpsilon) return top + screen >= end - progressionEpsilon ? 1 : 0;
    return clampProgress((top - start) / scrollable);
  };
  const start = unit.startTotalProgression;
  const end = unit.endTotalProgression;
  return {
    ...(chapterPrecision === 'continuous' && start !== undefined && end !== undefined && end > start
      ? { chapter: range(start, end) }
      : {}),
    overall: range(0, 1),
  };
}

function identitiesMatch(
  location: ReaderLocationEvent,
  navigation: NavigationUnitDerivationResult
): boolean {
  if (!Object.hasOwn(navigation, 'generation') || !Object.hasOwn(navigation, 'instanceId')) {
    return true;
  }
  const identified = navigation as NavigationUnitDerivationResult & {
    generation: number;
    instanceId: string;
  };
  return (
    identified.generation === location.generation && identified.instanceId === location.instanceId
  );
}

/** Calculates one navigation-unit-owned progress event, or null for an empty/stale snapshot. */
export function calculateReaderProgress(
  locationInput: ReaderLocationEvent,
  navigation: NavigationUnitDerivationResult
): ReaderProgressLocationEvent | null {
  const location = parseReaderLocationEvent(locationInput);
  if (!identitiesMatch(location, navigation) || navigation.units.length === 0) return null;

  const anchor = parseLocator(location.visibleRange?.start ?? location.locator);
  const position = anchor.locations?.position ?? location.position;
  const totalPositions = (location.totalPositions ?? navigation.positionCount) || undefined;
  const overall = deriveOverallProgress(location, anchor, navigation, position, totalPositions);
  const exact = exactTargetSelection(anchor, navigation.units);
  const selected =
    exact ??
    (location.precision === 'continuous'
      ? selectByContinuousProgress(overall.value, navigation.units)
      : undefined) ??
    (precisionRank[location.precision] >= precisionRank.position && position !== undefined
      ? selectByPosition(position, navigation.units)
      : undefined) ??
    selectByResource(anchor, navigation);
  if (!selected) return null;

  const chapter = deriveChapterProgress(
    location,
    anchor,
    navigation,
    selected.unit,
    overall.value,
    position
  );
  const screen = visibleSpan(location, anchor, navigation);
  const scrolled =
    screen === undefined
      ? undefined
      : scrollableRangeProgress(overall.value, screen, selected.unit, chapter.precision);
  return {
    ...location,
    chapterProgress: scrolled?.chapter ?? chapter.value,
    navigationUnit: parseNavigationUnit(selected.unit),
    overallProgress: scrolled?.overall ?? overall.value,
    ...(position === undefined ? {} : { position }),
    precision: leastPrecise(location.precision, overall.precision, chapter.precision),
    ...(totalPositions === undefined ? {} : { totalPositions }),
  };
}

/** Returns an enriched event when possible, otherwise a detached original event. */
export function enrichReaderLocationEvent(
  location: ReaderLocationEvent,
  navigation: NavigationUnitDerivationResult
): ReaderLocationEvent {
  return calculateReaderProgress(location, navigation) ?? parseReaderLocationEvent(location);
}

function checkpointFromEvent(eventInput: ReaderProgressLocationEvent): ReaderProgressCheckpoint {
  const event = parseReaderLocationEvent(eventInput);
  if (
    event.navigationUnit === undefined ||
    event.chapterProgress === undefined ||
    event.overallProgress === undefined
  ) {
    throw new TypeError('Reader progress state requires an enriched location event.');
  }
  return {
    chapterProgress: event.chapterProgress,
    locator: parseLocator(event.visibleRange?.start ?? event.locator),
    navigationUnitId: event.navigationUnit.id,
    overallProgress: event.overallProgress,
    ...(event.position === undefined ? {} : { position: event.position }),
    precision: event.precision,
  };
}

function checkpointIsFurther(
  candidate: ReaderProgressCheckpoint,
  current: ReaderProgressCheckpoint
): boolean {
  if (candidate.overallProgress > current.overallProgress + progressionEpsilon) return true;
  if (Math.abs(candidate.overallProgress - current.overallProgress) > progressionEpsilon) {
    return false;
  }
  return (
    candidate.position !== undefined &&
    current.position !== undefined &&
    candidate.position > current.position
  );
}

/** Pure controller reducer that keeps current progress and monotonic furthest progress separate. */
export function updateReaderProgressState(
  previous: ReaderProgressControllerState | undefined,
  event: ReaderProgressLocationEvent
): ReaderProgressControllerState {
  const checkpoint = checkpointFromEvent(event);
  const sameGeneration =
    previous?.instanceId === event.instanceId && previous.generation === event.generation;
  const existingUnits = sameGeneration ? previous.units : {};
  const existingUnit = existingUnits[checkpoint.navigationUnitId];
  const units = {
    ...existingUnits,
    [checkpoint.navigationUnitId]: {
      currentProgress: checkpoint.chapterProgress,
      furthestProgress: Math.max(checkpoint.chapterProgress, existingUnit?.furthestProgress ?? 0),
    },
  };
  const furthest =
    sameGeneration && previous && !checkpointIsFurther(checkpoint, previous.furthest)
      ? previous.furthest
      : checkpoint;
  return {
    current: checkpoint,
    furthest: {
      ...furthest,
      locator: parseLocator(furthest.locator),
    },
    generation: event.generation,
    instanceId: event.instanceId,
    units,
  };
}

export function createReaderProgressState(
  event: ReaderProgressLocationEvent
): ReaderProgressControllerState {
  return updateReaderProgressState(undefined, event);
}

/** Narrows a stable location callback after navigation-unit progress enrichment. */
export function isReaderProgressLocationEvent(
  event: ReaderLocationEvent
): event is ReaderProgressLocationEvent {
  return (
    event.navigationUnit !== undefined &&
    event.chapterProgress !== undefined &&
    event.overallProgress !== undefined
  );
}

/**
 * Compares reflow/recreation anchors without conflating current and furthest
 * progress. Position-backed checkpoints default to a one-position tolerance.
 */
export function readerProgressAnchorsAreMateriallyStable(
  before: ReaderProgressCheckpoint,
  after: ReaderProgressCheckpoint,
  options: ReaderProgressStabilityOptions = {}
): boolean {
  const positionTolerance = options.positionTolerance ?? 1;
  const progressionTolerance = options.progressionTolerance ?? 0.02;
  if (
    !Number.isSafeInteger(positionTolerance) ||
    positionTolerance < 0 ||
    !Number.isFinite(progressionTolerance) ||
    progressionTolerance < 0 ||
    progressionTolerance > 1
  ) {
    throw new RangeError('Reader progress stability tolerances are invalid.');
  }
  if (before.navigationUnitId !== after.navigationUnitId) return false;
  if (
    normalizeNavigationResourceHref(before.locator.href) !==
    normalizeNavigationResourceHref(after.locator.href)
  ) {
    return false;
  }
  if (before.position !== undefined && after.position !== undefined) {
    return Math.abs(before.position - after.position) <= positionTolerance;
  }
  return Math.abs(before.overallProgress - after.overallProgress) <= progressionTolerance;
}
