import { NativeEpubKitError, parseLocator, parsePublicationLink } from '../recordValidation.ts';
import {
  NAVIGATION_UNIT_DIAGNOSTIC_CODES,
  UNTITLED_RESOURCE_POLICIES,
  type ChapterGranularity,
  type Locator,
  type NavigationUnit,
  type NavigationUnitAlias,
  type NavigationUnitDerivationInput,
  type NavigationUnitDerivationResult,
  type NavigationUnitDiagnostic,
  type NavigationUnitResource,
  type NavigationUnitSnapshot,
  type PublicationInfo,
  type PublicationLink,
  type PublicationPositionsPage,
  type PublicationPositionsRequest,
  type UntitledResourcePolicy,
} from '../records.ts';

export const MAXIMUM_NAVIGATION_UNIT_DIAGNOSTIC_ISSUES = 512;
export const MAXIMUM_NAVIGATION_UNIT_DEPTH = 256;

const diagnosticCodes = new Set<string>(NAVIGATION_UNIT_DIAGNOSTIC_CODES);

interface NormalizedHref {
  fragment?: string;
  resource: string;
  target: string;
}

interface ReadingOrderEntry {
  index: number;
  link: PublicationLink;
  resource: string;
}

interface PositionEntry {
  fragments: Set<string>;
  locator: Locator;
  ordinal: number;
  resource: string;
  totalProgression?: number;
}

interface TocNode {
  childIds: string[];
  depth: number;
  id: string;
  link: PublicationLink;
  parentId?: string;
  path: number[];
  sourceOrder: number;
  target: NormalizedHref;
}

interface ResolvedBoundary {
  childIds: string[];
  depth: number;
  href: string;
  id: string;
  parentId?: string;
  resourceIndex: number;
  source: 'toc' | 'reading-order-fallback';
  sourceOrder: number;
  startLocator: Locator;
  startPosition?: number;
  startTotalProgression?: number;
  title: string;
}

interface IssueCollector {
  add(issue: NavigationUnitDiagnostic): void;
  issueCount(): number;
  issues: NavigationUnitDiagnostic[];
}

interface NavigationUnitSnapshotSource {
  getPositions(request: PublicationPositionsRequest): Promise<PublicationPositionsPage>;
  getPublication(): Promise<PublicationInfo>;
}

function createIssueCollector(): IssueCollector {
  const issues: NavigationUnitDiagnostic[] = [];
  let count = 0;
  return {
    add(issue) {
      if (!diagnosticCodes.has(issue.code)) {
        throw new TypeError(`Unknown navigation-unit diagnostic code ${issue.code}.`);
      }
      count += 1;
      if (issues.length < MAXIMUM_NAVIGATION_UNIT_DIAGNOSTIC_ISSUES) issues.push(issue);
    },
    issueCount: () => count,
    issues,
  };
}

function normalizePercentEncoding(value: string, fragment: boolean): string {
  let decoded = value;
  try {
    decoded = fragment ? decodeURIComponent(value) : decodeURI(value);
  } catch {
    // A malformed escape remains literal and deterministic. Native publication
    // data should already contain resolved URI-safe links.
  }
  return decoded.normalize('NFC').replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase());
}

function normalizeResourcePath(value: string): string {
  const withoutQuery = value.split('?', 1)[0] ?? '';
  const decoded = normalizePercentEncoding(withoutQuery, false);
  const segments: string[] = [];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

function normalizeHref(href: string, baseResource?: string): NormalizedHref {
  const fragmentIndex = href.indexOf('#');
  const resourcePart = fragmentIndex >= 0 ? href.slice(0, fragmentIndex) : href;
  const rawFragment = fragmentIndex >= 0 ? href.slice(fragmentIndex + 1) : undefined;
  const resource = normalizeResourcePath(resourcePart) || baseResource || '';
  const fragment =
    rawFragment === undefined || rawFragment.length === 0
      ? undefined
      : normalizePercentEncoding(rawFragment, true);
  return {
    ...(fragment === undefined ? {} : { fragment }),
    resource,
    target: `${resource}${fragment === undefined ? '' : `#${fragment}`}`,
  };
}

export function normalizeNavigationResourceHref(href: string): string {
  return normalizeHref(href).resource;
}

export function normalizeNavigationTargetHref(href: string, baseResource?: string): string {
  return normalizeHref(href, baseResource).target;
}

function stableTargetId(
  source: 'toc' | 'reading-order-fallback',
  path: readonly number[],
  target: string
): string {
  return `${source}:${path.join('.')}:${encodeURIComponent(target)}`;
}

export function normalizeChapterGranularity(granularity?: ChapterGranularity): ChapterGranularity {
  if (granularity === undefined || granularity === 'top-level') return 'top-level';
  if (granularity === 'leaf') return 'leaf';
  if (
    typeof granularity !== 'object' ||
    granularity === null ||
    Array.isArray(granularity) ||
    Object.keys(granularity).length !== 1 ||
    !Object.hasOwn(granularity, 'depth') ||
    !Number.isSafeInteger(granularity.depth) ||
    granularity.depth < 0 ||
    granularity.depth > MAXIMUM_NAVIGATION_UNIT_DEPTH
  ) {
    throw new RangeError(
      `Chapter granularity depth must be a safe integer within 0...${MAXIMUM_NAVIGATION_UNIT_DEPTH}.`
    );
  }
  return { depth: granularity.depth };
}

function flattenToc(links: readonly PublicationLink[]): TocNode[] {
  const nodes: TocNode[] = [];

  const visit = (
    link: PublicationLink,
    path: number[],
    depth: number,
    parentId?: string,
    baseResource?: string
  ): TocNode => {
    const target = normalizeHref(link.href, baseResource);
    const id = stableTargetId('toc', path, target.target);
    const node: TocNode = {
      childIds: [],
      depth,
      id,
      link,
      ...(parentId === undefined ? {} : { parentId }),
      path,
      sourceOrder: nodes.length,
      target,
    };
    nodes.push(node);
    link.children.forEach((child, index) => {
      const childNode = visit(child, [...path, index], depth + 1, id, target.resource);
      node.childIds.push(childNode.id);
    });
    return node;
  };

  links.forEach((link, index) => visit(link, [index], 0));
  return nodes;
}

function selectTocNodes(nodes: readonly TocNode[], granularity: ChapterGranularity): TocNode[] {
  if (granularity === 'top-level') return nodes.filter((node) => node.depth === 0);
  if (granularity === 'leaf') return nodes.filter((node) => node.childIds.length === 0);
  return nodes.filter(
    (node) =>
      node.depth === granularity.depth ||
      (node.depth < granularity.depth && node.childIds.length === 0)
  );
}

function titleForBoundary(
  title: string | undefined,
  target: NormalizedHref,
  readingOrder: ReadingOrderEntry
): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  const readingTitle = readingOrder.link.title?.trim();
  if (readingTitle) return readingTitle;
  if (target.fragment) return target.fragment;
  const filename = target.resource
    .split('/')
    .at(-1)
    ?.replace(/\.[^.]*$/, '')
    .trim();
  return filename || `Section ${readingOrder.index + 1}`;
}

function createStartLocator(
  target: NormalizedHref,
  link: PublicationLink,
  readingOrder: ReadingOrderEntry,
  position?: PositionEntry
): Locator {
  if (!position) {
    return {
      href: target.resource,
      ...(target.fragment === undefined ? {} : { locations: { fragments: [target.fragment] } }),
      type: link.type ?? readingOrder.link.type ?? 'application/xhtml+xml',
    };
  }

  const locations = {
    ...(position.locator.locations ?? {}),
    ...(target.fragment === undefined ? {} : { fragments: [target.fragment] }),
    position: position.ordinal,
  };
  return {
    ...position.locator,
    href: target.resource,
    locations,
    type: link.type ?? position.locator.type,
  };
}

function compareBoundaryOrder(left: ResolvedBoundary, right: ResolvedBoundary): number {
  if (left.resourceIndex !== right.resourceIndex) return left.resourceIndex - right.resourceIndex;
  if (left.startPosition !== undefined && right.startPosition !== undefined) {
    const positionOrder = left.startPosition - right.startPosition;
    if (positionOrder !== 0) return positionOrder;
  }
  if (left.startTotalProgression !== undefined && right.startTotalProgression !== undefined) {
    const progressionOrder = left.startTotalProgression - right.startTotalProgression;
    if (progressionOrder !== 0) return progressionOrder;
  }
  return 0;
}

function sortBoundaries(left: ResolvedBoundary, right: ResolvedBoundary): number {
  return compareBoundaryOrder(left, right) || left.sourceOrder - right.sourceOrder;
}

function withIntervals(
  boundaries: readonly ResolvedBoundary[],
  totalPositions: number,
  issues: IssueCollector
): NavigationUnit[] {
  return boundaries.map((boundary, index) => {
    const next = boundaries[index + 1];
    const unit: NavigationUnit = {
      childIds: [...boundary.childIds],
      depth: boundary.depth,
      href: boundary.href,
      id: boundary.id,
      ...(boundary.parentId === undefined ? {} : { parentId: boundary.parentId }),
      source: boundary.source,
      startLocator: parseLocator(boundary.startLocator),
      ...(boundary.startPosition === undefined ? {} : { startPosition: boundary.startPosition }),
      ...(boundary.startTotalProgression === undefined
        ? {}
        : { startTotalProgression: boundary.startTotalProgression }),
      title: boundary.title,
    };

    if (next) {
      unit.endLocator = parseLocator(next.startLocator);
      if (boundary.startPosition !== undefined && next.startPosition !== undefined) {
        if (next.startPosition > boundary.startPosition) {
          unit.endPositionExclusive = next.startPosition;
        } else {
          issues.add({
            code: 'unit-position-interval-empty',
            href: boundary.href,
            unitId: boundary.id,
          });
        }
      }
      if (
        boundary.startTotalProgression !== undefined &&
        next.startTotalProgression !== undefined
      ) {
        if (next.startTotalProgression > boundary.startTotalProgression) {
          unit.endTotalProgression = next.startTotalProgression;
        } else {
          issues.add({
            code: 'unit-progression-interval-empty',
            href: boundary.href,
            unitId: boundary.id,
          });
        }
      }
    } else {
      if (boundary.startPosition !== undefined && totalPositions > 0) {
        unit.endPositionExclusive = totalPositions + 1;
      }
      if (boundary.startTotalProgression === undefined || boundary.startTotalProgression < 1) {
        unit.endTotalProgression = 1;
      } else {
        issues.add({
          code: 'unit-progression-interval-empty',
          href: boundary.href,
          unitId: boundary.id,
        });
      }
    }
    return unit;
  });
}

function readingOrderIntervals(
  readingOrder: readonly ReadingOrderEntry[],
  positionsByResource: ReadonlyMap<string, readonly PositionEntry[]>,
  totalPositions: number
): NavigationUnitResource[] {
  const resources = readingOrder.map((entry) => {
    const target = normalizeHref(entry.link.href);
    const position = positionsByResource.get(entry.resource)?.[0];
    return {
      href: entry.resource,
      index: entry.index,
      startLocator: createStartLocator(target, entry.link, entry, position),
      ...(position === undefined ? {} : { startPosition: position.ordinal }),
      ...(position?.totalProgression === undefined
        ? {}
        : { startTotalProgression: position.totalProgression }),
    } satisfies NavigationUnitResource;
  });

  return resources.map((resource, index) => {
    const next = resources[index + 1];
    return {
      ...resource,
      ...(next === undefined ? {} : { endLocator: parseLocator(next.startLocator) }),
      ...(next?.startPosition !== undefined &&
      resource.startPosition !== undefined &&
      next.startPosition > resource.startPosition
        ? { endPositionExclusive: next.startPosition }
        : next === undefined && resource.startPosition !== undefined && totalPositions > 0
          ? { endPositionExclusive: totalPositions + 1 }
          : {}),
      ...(next?.startTotalProgression !== undefined &&
      resource.startTotalProgression !== undefined &&
      next.startTotalProgression > resource.startTotalProgression
        ? { endTotalProgression: next.startTotalProgression }
        : next === undefined &&
            (resource.startTotalProgression === undefined || resource.startTotalProgression < 1)
          ? { endTotalProgression: 1 }
          : {}),
    };
  });
}

/**
 * Derives deterministic progress/navigation boundaries from detached
 * publication data. The function is pure and never calls a native toolkit.
 */
export function deriveNavigationUnits(
  input: NavigationUnitDerivationInput
): NavigationUnitDerivationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Navigation-unit derivation input must be an object.');
  }
  if (!Array.isArray(input.tableOfContents)) {
    throw new TypeError('Navigation-unit tableOfContents must be an array.');
  }
  if (!Array.isArray(input.readingOrder)) {
    throw new TypeError('Navigation-unit readingOrder must be an array.');
  }
  if (!Array.isArray(input.positions)) {
    throw new TypeError('Navigation-unit positions must be an array.');
  }
  const untitledResources = normalizeUntitledResourcePolicy(input.untitledResources);

  const granularity = normalizeChapterGranularity(input.granularity);
  const tableOfContents = input.tableOfContents.map(parsePublicationLink);
  const rawReadingOrder = input.readingOrder.map(parsePublicationLink);
  const positions = input.positions.map(parseLocator);
  const issueCollector = createIssueCollector();

  if (positions.length === 0) issueCollector.add({ code: 'positions-unavailable' });
  if (rawReadingOrder.length === 0) issueCollector.add({ code: 'reading-order-empty' });
  if (tableOfContents.length === 0) issueCollector.add({ code: 'toc-empty' });

  const readingOrder: ReadingOrderEntry[] = [];
  const readingOrderByResource = new Map<string, ReadingOrderEntry>();
  rawReadingOrder.forEach((link, index) => {
    const resource = normalizeHref(link.href).resource;
    if (!resource) {
      throw new TypeError(`Reading-order href at index ${index} does not identify a resource.`);
    }
    const entry: ReadingOrderEntry = { index, link, resource };
    if (readingOrderByResource.has(resource)) {
      issueCollector.add({ code: 'reading-order-duplicate-resource', href: resource });
      return;
    }
    readingOrder.push(entry);
    readingOrderByResource.set(resource, entry);
  });

  const positionsByResource = new Map<string, PositionEntry[]>();
  positions.forEach((locator, index) => {
    const normalized = normalizeHref(locator.href);
    const ordinal = index + 1;
    if (locator.locations?.position !== undefined && locator.locations.position !== ordinal) {
      issueCollector.add({ code: 'position-number-mismatch', href: normalized.resource });
    }
    const locatorFragments = new Set<string>();
    if (normalized.fragment) locatorFragments.add(normalized.fragment);
    locator.locations?.fragments?.forEach((fragment) =>
      locatorFragments.add(normalizePercentEncoding(fragment, true))
    );
    const totalProgression = locator.locations?.totalProgression;
    const entry: PositionEntry = {
      fragments: locatorFragments,
      locator,
      ordinal,
      resource: normalized.resource,
      ...(totalProgression === undefined ? {} : { totalProgression }),
    };
    const resourcePositions = positionsByResource.get(entry.resource) ?? [];
    resourcePositions.push(entry);
    positionsByResource.set(entry.resource, resourcePositions);
  });

  const tocNodes = flattenToc(tableOfContents);
  const selectedNodes = selectTocNodes(tocNodes, granularity);
  const aliases: NavigationUnitAlias[] = [];
  let unresolvedTocEntryCount = 0;
  let duplicateBoundaryCount = 0;
  let outOfOrderTocEntryCount = 0;
  let fallbackUnitCount = 0;

  const resolvedInSourceOrder: ResolvedBoundary[] = [];
  for (const node of selectedNodes) {
    const readingEntry = readingOrderByResource.get(node.target.resource);
    if (!readingEntry) {
      unresolvedTocEntryCount += 1;
      issueCollector.add({
        code: 'toc-entry-unresolved',
        href: node.target.target,
        tocId: node.id,
      });
      continue;
    }
    const resourcePositions = positionsByResource.get(node.target.resource) ?? [];
    const exactPosition =
      node.target.fragment === undefined
        ? undefined
        : resourcePositions.find((position) =>
            position.fragments.has(node.target.fragment as string)
          );
    const position = exactPosition ?? resourcePositions[0];
    const rawTitle = node.link.title?.trim();
    if (!rawTitle) {
      issueCollector.add({
        code: 'toc-entry-untitled',
        href: node.target.target,
        tocId: node.id,
      });
    }
    resolvedInSourceOrder.push({
      childIds: [...node.childIds],
      depth: node.depth,
      href: node.target.target,
      id: node.id,
      ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
      resourceIndex: readingEntry.index,
      source: 'toc',
      sourceOrder: node.sourceOrder,
      startLocator: createStartLocator(node.target, node.link, readingEntry, position),
      ...(position === undefined ? {} : { startPosition: position.ordinal }),
      ...(position?.totalProgression === undefined
        ? {}
        : { startTotalProgression: position.totalProgression }),
      title: titleForBoundary(rawTitle, node.target, readingEntry),
    });
  }

  const uniqueTocBoundaries: ResolvedBoundary[] = [];
  const primaryByTarget = new Map<string, ResolvedBoundary>();
  for (const boundary of resolvedInSourceOrder) {
    const primary = primaryByTarget.get(boundary.href);
    if (!primary) {
      primaryByTarget.set(boundary.href, boundary);
      uniqueTocBoundaries.push(boundary);
      continue;
    }
    duplicateBoundaryCount += 1;
    aliases.push({
      depth: boundary.depth,
      href: boundary.href,
      id: boundary.id,
      title: boundary.title,
      unitId: primary.id,
    });
    issueCollector.add({
      code: 'toc-duplicate-boundary',
      href: boundary.href,
      tocId: boundary.id,
      unitId: primary.id,
    });
  }

  let furthestSourceBoundary: ResolvedBoundary | undefined;
  for (const boundary of uniqueTocBoundaries) {
    if (furthestSourceBoundary && compareBoundaryOrder(boundary, furthestSourceBoundary) < 0) {
      outOfOrderTocEntryCount += 1;
      issueCollector.add({
        code: 'toc-entry-out-of-order',
        href: boundary.href,
        tocId: boundary.id,
      });
    } else if (
      !furthestSourceBoundary ||
      compareBoundaryOrder(boundary, furthestSourceBoundary) > 0
    ) {
      furthestSourceBoundary = boundary;
    }
  }

  const tocCoveredResources = new Set(
    tocNodes
      .map((node) => node.target.resource)
      .filter((resource) => readingOrderByResource.has(resource))
  );
  const earliestSelectedResource = uniqueTocBoundaries.reduce(
    (earliest, boundary) => Math.min(earliest, boundary.resourceIndex),
    Number.POSITIVE_INFINITY
  );
  const fallbackBoundaries: ResolvedBoundary[] = [];
  for (const readingEntry of readingOrder) {
    const needsFallback =
      uniqueTocBoundaries.length === 0 ||
      readingEntry.index < earliestSelectedResource ||
      (!tocCoveredResources.has(readingEntry.resource) && untitledResources === 'separate-units');
    if (!needsFallback) continue;

    const target = normalizeHref(readingEntry.link.href);
    const position = positionsByResource.get(readingEntry.resource)?.[0];
    const id = stableTargetId('reading-order-fallback', [readingEntry.index], target.resource);
    fallbackUnitCount += 1;
    issueCollector.add({ code: 'reading-order-fallback', href: target.resource, unitId: id });
    fallbackBoundaries.push({
      childIds: [],
      depth: 0,
      href: target.resource,
      id,
      resourceIndex: readingEntry.index,
      source: 'reading-order-fallback',
      sourceOrder: tocNodes.length + readingEntry.index,
      startLocator: createStartLocator(target, readingEntry.link, readingEntry, position),
      ...(position === undefined ? {} : { startPosition: position.ordinal }),
      ...(position?.totalProgression === undefined
        ? {}
        : { startTotalProgression: position.totalProgression }),
      title: titleForBoundary(readingEntry.link.title, target, readingEntry),
    });
  }

  const boundaries = [...uniqueTocBoundaries, ...fallbackBoundaries].sort(sortBoundaries);
  const units = withIntervals(boundaries, positions.length, issueCollector);
  const resources = readingOrderIntervals(readingOrder, positionsByResource, positions.length);
  const issueCount = issueCollector.issueCount();

  return {
    aliases,
    diagnostics: {
      aliasCount: aliases.length,
      duplicateBoundaryCount,
      fallbackUnitCount,
      issueCount,
      issues: issueCollector.issues,
      issuesTruncated: issueCount - issueCollector.issues.length,
      outOfOrderTocEntryCount,
      readingOrderResourceCount: readingOrder.length,
      selectedTocEntryCount: selectedNodes.length,
      tocEntryCount: tocNodes.length,
      unitCount: units.length,
      unresolvedTocEntryCount,
    },
    granularity,
    positionCount: positions.length,
    resources,
    units,
  };
}

function snapshotMismatch(message: string): NativeEpubKitError {
  return new NativeEpubKitError({
    code: 'NATIVE_INVARIANT_VIOLATION',
    message,
    phase: 'resource',
    recoverable: true,
  });
}

export function normalizeUntitledResourcePolicy(
  policy: UntitledResourcePolicy | undefined
): UntitledResourcePolicy {
  if (policy === undefined) return 'separate-units';
  if (!(UNTITLED_RESOURCE_POLICIES as readonly string[]).includes(policy)) {
    throw new TypeError(
      `Untitled resource policy must be one of ${UNTITLED_RESOURCE_POLICIES.join(', ')}.`
    );
  }
  return policy;
}

/** Loads every bounded position page while enforcing one coherent generation. */
export async function loadNavigationUnitSnapshot(
  source: NavigationUnitSnapshotSource,
  granularity?: ChapterGranularity,
  untitledResources?: UntitledResourcePolicy
): Promise<NavigationUnitSnapshot> {
  const normalizedGranularity = normalizeChapterGranularity(granularity);
  const publication = await source.getPublication();
  const positions: Locator[] = [];
  let offset = 0;

  do {
    const page = await source.getPositions({ limit: 256, offset });
    if (
      page.instanceId !== publication.instanceId ||
      page.generation !== publication.generation ||
      page.total !== publication.positionCount ||
      page.offset !== offset
    ) {
      throw snapshotMismatch(
        'Publication metadata and position pages did not describe one reader generation.'
      );
    }
    positions.push(...page.positions);
    if (page.nextOffset === undefined) break;
    if (page.nextOffset <= offset) {
      throw snapshotMismatch('Publication position paging did not advance.');
    }
    offset = page.nextOffset;
  } while (positions.length <= publication.positionCount);

  if (positions.length !== publication.positionCount) {
    throw snapshotMismatch(
      'Publication position paging did not match the declared position count.'
    );
  }

  return {
    ...deriveNavigationUnits({
      granularity: normalizedGranularity,
      positions,
      ...(untitledResources === undefined ? {} : { untitledResources }),
      readingOrder: publication.readingOrder,
      tableOfContents: publication.tableOfContents,
    }),
    generation: publication.generation,
    instanceId: publication.instanceId,
  };
}
