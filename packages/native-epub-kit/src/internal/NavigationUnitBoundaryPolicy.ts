import { parseLocator, parseNavigationUnit } from '../recordValidation.ts';
import type {
  Locator,
  NavigationUnitBoundaryEvent,
  NavigationUnitContext,
  NavigationUnitSnapshot,
  ProgressPrecision,
  ReaderLocationEvent,
  ReaderLinkEvent,
  ReaderNavigationHistoryEntry,
  ReaderNavigationHistoryState,
} from '../records.ts';
import {
  normalizeNavigationResourceHref,
  normalizeNavigationTargetHref,
} from './NavigationUnitPolicy.ts';
import { calculateReaderProgress } from './ReaderProgressPolicy.ts';

export const MAXIMUM_NAVIGATION_HISTORY_ENTRIES = 64;
const progressionEpsilon = 1e-9;

export interface NativeNavigationUnitBoundary {
  endPositionExclusive?: number;
  endTotalProgression?: number;
  href: string;
  id: string;
  startPosition?: number;
  startTotalProgression?: number;
}

export interface NativeNavigationUnitBoundaryConfiguration {
  generation: number;
  instanceId: string;
  precision: ProgressPrecision;
  units: NativeNavigationUnitBoundary[];
}

export interface NavigationUnitBoundaryMatch {
  index: number;
  precision: ProgressPrecision;
  unit: NativeNavigationUnitBoundary;
}

function assertIdentity(identity: { generation: number; instanceId: string }): void {
  if (!Number.isSafeInteger(identity.generation) || identity.generation < 0) {
    throw new TypeError('Navigation identity generation must be a non-negative safe integer.');
  }
  if (typeof identity.instanceId !== 'string' || identity.instanceId.length === 0) {
    throw new TypeError('Navigation identity instanceId must be a non-empty string.');
  }
}

function exactTarget(locator: Locator): string | undefined {
  const fragment = locator.locations?.fragments?.[0];
  if (!fragment) return undefined;
  return normalizeNavigationTargetHref(
    `${normalizeNavigationResourceHref(locator.href)}#${fragment}`
  );
}

function containsContinuous(value: number, unit: NativeNavigationUnitBoundary): boolean {
  const start = unit.startTotalProgression;
  const end = unit.endTotalProgression;
  if (start === undefined || end === undefined || end <= start) return false;
  const atPublicationEnd =
    Math.abs(value - 1) <= progressionEpsilon && Math.abs(end - 1) <= progressionEpsilon;
  return value >= start && (value < end || atPublicationEnd);
}

function containsPosition(value: number, unit: NativeNavigationUnitBoundary): boolean {
  const start = unit.startPosition;
  const end = unit.endPositionExclusive;
  return start !== undefined && end !== undefined && value >= start && value < end;
}

function matchByContinuous(
  units: readonly NativeNavigationUnitBoundary[],
  locator: Locator
): NavigationUnitBoundaryMatch | undefined {
  const value = locator.locations?.totalProgression;
  if (value === undefined) return undefined;
  const exact = units.findIndex(
    (unit) =>
      unit.startTotalProgression !== undefined &&
      Math.abs(unit.startTotalProgression - value) <= progressionEpsilon
  );
  const index = exact >= 0 ? exact : units.findIndex((unit) => containsContinuous(value, unit));
  return index < 0 ? undefined : { index, precision: 'continuous', unit: units[index]! };
}

function matchByPosition(
  units: readonly NativeNavigationUnitBoundary[],
  locator: Locator
): NavigationUnitBoundaryMatch | undefined {
  const value = locator.locations?.position;
  if (value === undefined) return undefined;
  const exact = units.findIndex((unit) => unit.startPosition === value);
  const index = exact >= 0 ? exact : units.findIndex((unit) => containsPosition(value, unit));
  return index < 0 ? undefined : { index, precision: 'position', unit: units[index]! };
}

function matchByResource(
  units: readonly NativeNavigationUnitBoundary[],
  locator: Locator,
  preferredUnitId?: string
): NavigationUnitBoundaryMatch | undefined {
  const target = exactTarget(locator);
  if (target) {
    const exact = units.findIndex((unit) => normalizeNavigationTargetHref(unit.href) === target);
    if (exact >= 0) return { index: exact, precision: 'resource', unit: units[exact]! };
  }
  const resource = normalizeNavigationResourceHref(locator.href);
  const matching = units
    .map((unit, index) => ({ index, unit }))
    .filter(({ unit }) => normalizeNavigationResourceHref(unit.href) === resource);
  if (preferredUnitId) {
    const preferred = matching.find(({ unit }) => unit.id === preferredUnitId);
    if (preferred) return { ...preferred, precision: 'resource' };
  }
  const selected = matching[0];
  return selected ? { ...selected, precision: 'resource' } : undefined;
}

export function matchNavigationUnitBoundary(
  units: readonly NativeNavigationUnitBoundary[],
  locatorInput: Locator,
  precision: ProgressPrecision,
  preferredUnitId?: string
): NavigationUnitBoundaryMatch | undefined {
  const locator = parseLocator(locatorInput);
  if (precision === 'continuous') {
    return (
      matchByContinuous(units, locator) ??
      matchByPosition(units, locator) ??
      matchByResource(units, locator, preferredUnitId)
    );
  }
  if (precision === 'position') {
    return matchByPosition(units, locator) ?? matchByResource(units, locator, preferredUnitId);
  }
  return matchByResource(units, locator, preferredUnitId);
}

export function createNativeNavigationUnitBoundaryConfiguration(
  snapshot: NavigationUnitSnapshot,
  precision: ProgressPrecision
): NativeNavigationUnitBoundaryConfiguration {
  assertIdentity(snapshot);
  if (!['continuous', 'position', 'resource'].includes(precision)) {
    throw new TypeError('Navigation-unit boundary precision is invalid.');
  }
  const hasContinuousIntervals = snapshot.units.every(
    (unit) =>
      unit.startTotalProgression !== undefined &&
      unit.endTotalProgression !== undefined &&
      unit.endTotalProgression > unit.startTotalProgression
  );
  const hasPositionIntervals = snapshot.units.every(
    (unit) =>
      unit.startPosition !== undefined &&
      unit.endPositionExclusive !== undefined &&
      unit.endPositionExclusive > unit.startPosition
  );
  const boundaryPrecision: ProgressPrecision =
    precision === 'continuous' && hasContinuousIntervals
      ? 'continuous'
      : precision !== 'resource' && hasPositionIntervals
        ? 'position'
        : 'resource';
  return {
    generation: snapshot.generation,
    instanceId: snapshot.instanceId,
    precision: boundaryPrecision,
    units: snapshot.units.map((unit) => ({
      ...(unit.endPositionExclusive === undefined
        ? {}
        : { endPositionExclusive: unit.endPositionExclusive }),
      ...(unit.endTotalProgression === undefined
        ? {}
        : { endTotalProgression: unit.endTotalProgression }),
      href: unit.href,
      id: unit.id,
      ...(unit.startPosition === undefined ? {} : { startPosition: unit.startPosition }),
      ...(unit.startTotalProgression === undefined
        ? {}
        : { startTotalProgression: unit.startTotalProgression }),
    })),
  };
}

export function navigationUnitContextForLocation(
  location: ReaderLocationEvent,
  snapshot: NavigationUnitSnapshot
): NavigationUnitContext | null {
  const progress = calculateReaderProgress(location, snapshot);
  if (!progress) return null;
  const index = snapshot.units.findIndex((unit) => unit.id === progress.navigationUnit.id);
  if (index < 0) return null;
  const previous = snapshot.units[index - 1];
  const next = snapshot.units[index + 1];
  const currentPosition = progress.locator.locations?.position;
  const finalPosition = progress.navigationUnit.endPositionExclusive;
  return {
    atEnd: progress.chapterProgress >= 1 - progressionEpsilon,
    atLastPosition:
      currentPosition !== undefined &&
      finalPosition !== undefined &&
      currentPosition === finalPosition - 1,
    atStart: progress.chapterProgress <= progressionEpsilon,
    chapterProgress: progress.chapterProgress,
    generation: progress.generation,
    index,
    instanceId: progress.instanceId,
    locator: parseLocator(progress.locator),
    navigationUnit: parseNavigationUnit(progress.navigationUnit),
    ...(next === undefined ? {} : { nextNavigationUnit: parseNavigationUnit(next) }),
    precision: progress.precision,
    ...(previous === undefined ? {} : { previousNavigationUnit: parseNavigationUnit(previous) }),
  };
}

function unknownRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function parseNativeNavigationUnitBoundaryEvent(
  value: unknown,
  snapshot: NavigationUnitSnapshot
): NavigationUnitBoundaryEvent {
  const event = unknownRecord(value, 'Native navigation-unit boundary event');
  if (event.instanceId !== snapshot.instanceId || event.generation !== snapshot.generation) {
    throw new TypeError('Native navigation-unit boundary identity is stale.');
  }
  if (!Number.isSafeInteger(event.sequence) || (event.sequence as number) < 1) {
    throw new TypeError('Native navigation-unit boundary sequence is invalid.');
  }
  if (event.direction !== 'forward' && event.direction !== 'backward') {
    throw new TypeError('Native navigation-unit boundary direction is invalid.');
  }
  const boundary = event.direction === 'forward' ? 'end' : 'start';
  if (event.boundary !== boundary) {
    throw new TypeError('Native navigation-unit boundary side disagrees with direction.');
  }
  if (!['continuous', 'position', 'resource'].includes(String(event.precision))) {
    throw new TypeError('Native navigation-unit boundary precision is invalid.');
  }
  if (typeof event.navigationUnitId !== 'string') {
    throw new TypeError('Native navigation-unit boundary current ID is invalid.');
  }
  const navigationUnit = snapshot.units.find((unit) => unit.id === event.navigationUnitId);
  if (!navigationUnit)
    throw new TypeError('Native navigation-unit boundary current ID is unknown.');
  const adjacentNavigationUnit =
    typeof event.adjacentNavigationUnitId === 'string'
      ? snapshot.units.find((unit) => unit.id === event.adjacentNavigationUnitId)
      : undefined;
  if (typeof event.adjacentNavigationUnitId === 'string' && !adjacentNavigationUnit) {
    throw new TypeError('Native navigation-unit boundary adjacent ID is unknown.');
  }
  const kind = adjacentNavigationUnit ? 'unit' : 'publication';
  if (event.kind !== kind) {
    throw new TypeError('Native navigation-unit boundary kind is incoherent.');
  }
  return {
    ...(adjacentNavigationUnit === undefined
      ? {}
      : { adjacentNavigationUnit: parseNavigationUnit(adjacentNavigationUnit) }),
    boundary,
    direction: event.direction,
    generation: snapshot.generation,
    instanceId: snapshot.instanceId,
    kind,
    locator: parseLocator(event.locator),
    navigationUnit: parseNavigationUnit(navigationUnit),
    precision: event.precision as ProgressPrecision,
    sequence: event.sequence as number,
  };
}

function validateHistoryLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAXIMUM_NAVIGATION_HISTORY_ENTRIES) {
    throw new TypeError(
      `Navigation history limit must be a safe integer from 1 to ${MAXIMUM_NAVIGATION_HISTORY_ENTRIES}.`
    );
  }
  return limit;
}

function detachedHistoryEntry(entry: ReaderNavigationHistoryEntry): ReaderNavigationHistoryEntry {
  return {
    locator: parseLocator(entry.locator),
    ...(entry.navigationUnitId === undefined ? {} : { navigationUnitId: entry.navigationUnitId }),
  };
}

function historyState(
  identity: { generation: number; instanceId: string },
  limit: number,
  entries: readonly ReaderNavigationHistoryEntry[]
): ReaderNavigationHistoryState {
  assertIdentity(identity);
  const bounded = entries.slice(-validateHistoryLimit(limit)).map(detachedHistoryEntry);
  return {
    canGoBack: bounded.length > 0,
    entries: bounded,
    generation: identity.generation,
    instanceId: identity.instanceId,
    limit,
  };
}

export function createReaderNavigationHistory(
  identity: { generation: number; instanceId: string },
  limit = MAXIMUM_NAVIGATION_HISTORY_ENTRIES
): ReaderNavigationHistoryState {
  return historyState(identity, limit, []);
}

export function pushReaderNavigationHistory(
  state: ReaderNavigationHistoryState,
  entry: ReaderNavigationHistoryEntry
): ReaderNavigationHistoryState {
  const detached = detachedHistoryEntry(entry);
  const previous = state.entries.at(-1);
  if (previous && JSON.stringify(previous.locator) === JSON.stringify(detached.locator)) {
    return historyState(state, state.limit, state.entries);
  }
  return historyState(state, state.limit, [...state.entries, detached]);
}

export function popReaderNavigationHistory(state: ReaderNavigationHistoryState): {
  entry: ReaderNavigationHistoryEntry | null;
  state: ReaderNavigationHistoryState;
} {
  const entry = state.entries.at(-1);
  return {
    entry: entry ? detachedHistoryEntry(entry) : null,
    state: historyState(state, state.limit, state.entries.slice(0, -1)),
  };
}

export function clearReaderNavigationHistory(
  state: ReaderNavigationHistoryState
): ReaderNavigationHistoryState {
  return historyState(state, state.limit, []);
}

export function cloneReaderNavigationHistory(
  state: ReaderNavigationHistoryState
): ReaderNavigationHistoryState {
  return historyState(state, state.limit, state.entries);
}

export function navigationHistoryEntryFromLocation(
  location: ReaderLocationEvent
): ReaderNavigationHistoryEntry {
  return {
    locator: parseLocator(location.locator),
    ...(location.navigationUnit?.id === undefined
      ? {}
      : { navigationUnitId: location.navigationUnit.id }),
  };
}

/** Ordinary native hyperlinks bypass ref commands, so adapt their exact source explicitly. */
export function navigationHistoryEntryFromFollowedLink(
  link: Pick<ReaderLinkEvent, 'disposition' | 'kind' | 'sourceLocator'>
): ReaderNavigationHistoryEntry | null {
  if (link.kind !== 'internal' || link.disposition !== 'followed') return null;
  return { locator: parseLocator(link.sourceLocator) };
}
