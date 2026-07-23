import {
  DEFAULT_PUBLICATION_POSITION_PAGE_SIZE,
  MAXIMUM_PUBLICATION_POSITION_PAGE_SIZE,
  type PublicationPositionsRequest,
} from '../records.ts';

export { DEFAULT_PUBLICATION_POSITION_PAGE_SIZE, MAXIMUM_PUBLICATION_POSITION_PAGE_SIZE };

export interface PublicationLinkShape {
  children: PublicationLinkShape[];
  href: string;
}

export interface PublicationPositionPageBounds {
  count: number;
  nextOffset?: number;
  offset: number;
}

export interface NormalizedPublicationPositionRequest {
  limit: number;
  offset: number;
}

const maximumAndroidInteger = 2_147_483_647;

export function normalizePublicationPositionRequest(
  request?: PublicationPositionsRequest
): NormalizedPublicationPositionRequest {
  const offset = request?.offset ?? 0;
  const requestedLimit = request?.limit ?? DEFAULT_PUBLICATION_POSITION_PAGE_SIZE;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximumAndroidInteger) {
    throw new RangeError(
      `Publication position offset must be an integer within 0...${maximumAndroidInteger}.`
    );
  }
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit <= 0) {
    throw new RangeError('Publication position limit must be a positive safe integer.');
  }
  return {
    limit: Math.min(requestedLimit, MAXIMUM_PUBLICATION_POSITION_PAGE_SIZE),
    offset,
  };
}

const normalizeResourceHref = (href: string) => {
  const resource = href.split('#', 1)[0]!.split('?', 1)[0]!;
  const segments: string[] = [];
  for (const segment of resource.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
};

const normalizeTargetHref = (href: string) => {
  const fragmentIndex = href.indexOf('#');
  const fragment = fragmentIndex >= 0 ? href.slice(fragmentIndex) : '';
  return `${normalizeResourceHref(href)}${fragment}`;
};

const flattenLinks = (links: readonly PublicationLinkShape[]): PublicationLinkShape[] => {
  const flattened: PublicationLinkShape[] = [];
  const visit = (link: PublicationLinkShape, depth: number) => {
    if (depth > 256) return;
    flattened.push(link);
    link.children.forEach((child) => visit(child, depth + 1));
  };
  links.forEach((link) => visit(link, 0));
  return flattened;
};

export function publicationDataWarnings(
  tableOfContents: readonly PublicationLinkShape[],
  readingOrderHrefs: readonly string[],
  positionCount: number,
  fixedLayout: boolean
): string[] {
  const warnings: string[] = [];
  const flattened = flattenLinks(tableOfContents);
  if (flattened.length === 0) warnings.push('toc-empty');

  const targets = flattened.map((link) => normalizeTargetHref(link.href));
  if (new Set(targets).size !== targets.length) warnings.push('toc-duplicate-targets');

  const coveredResources = new Set(flattened.map((link) => normalizeResourceHref(link.href)));
  const readingOrderResources = new Set(readingOrderHrefs.map(normalizeResourceHref));
  if ([...readingOrderResources].some((href) => !coveredResources.has(href))) {
    warnings.push('toc-incomplete');
  }
  if (positionCount === 0) warnings.push('positions-unavailable');
  if (fixedLayout) warnings.push('fixed-layout-preferences-limited');
  return warnings;
}

export function publicationPositionPageBounds(
  total: number,
  requestedOffset?: number | null,
  requestedLimit?: number | null
): PublicationPositionPageBounds {
  const safeTotal = Math.max(0, Math.trunc(total));
  const offset = Math.min(safeTotal, Math.max(0, Math.trunc(requestedOffset ?? 0)));
  const positiveLimit = Math.trunc(requestedLimit ?? DEFAULT_PUBLICATION_POSITION_PAGE_SIZE);
  const limit = Math.min(
    MAXIMUM_PUBLICATION_POSITION_PAGE_SIZE,
    positiveLimit > 0 ? positiveLimit : DEFAULT_PUBLICATION_POSITION_PAGE_SIZE
  );
  const count = Math.min(limit, safeTotal - offset);
  const end = offset + count;
  return {
    count,
    ...(end < safeTotal ? { nextOffset: end } : {}),
    offset,
  };
}
