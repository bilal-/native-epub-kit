import {
  EXTERNAL_LINK_POLICIES,
  FOOTNOTE_POLICY_MODES,
  UNSUPPORTED_SCHEME_POLICIES,
  type FootnoteClassification,
  type FootnoteHeuristicRule,
  type FootnotePolicy,
  type ReaderLinkDisposition,
  type ReaderLinkKind,
  type ReaderLinkPolicy,
  type ResolvedFootnotePolicy,
  type ResolvedReaderLinkPolicy,
} from '../records.ts';

export const MAXIMUM_FOOTNOTE_HEURISTIC_RULES = 16;
export const MAXIMUM_EXTERNAL_LINK_SCHEMES = 16;
export const MAXIMUM_FOOTNOTE_MATCH_VALUE_UTF16_UNITS = 128;

export const DEFAULT_FOOTNOTE_POLICY: Readonly<ResolvedFootnotePolicy> = Object.freeze({
  heuristicRules: [],
  mode: 'semantic',
});

export const DEFAULT_READER_LINK_POLICY: Readonly<ResolvedReaderLinkPolicy> = Object.freeze({
  allowedExternalSchemes: ['http', 'https'],
  externalLinks: 'intercept',
  unsupportedSchemes: 'block',
});

export interface InternalFootnoteDecision {
  classification?: FootnoteClassification;
  decision: 'emit' | 'navigate';
  ruleId?: string;
}

export interface ExternalLinkDecision {
  disposition: ReaderLinkDisposition;
  kind: ReaderLinkKind;
  scheme?: string;
}

const modeValues = new Set<string>(FOOTNOTE_POLICY_MODES);
const externalValues = new Set<string>(EXTERNAL_LINK_POLICIES);
const unsupportedValues = new Set<string>(UNSUPPORTED_SCHEME_POLICIES);
const schemePattern = /^[a-z][a-z0-9+.-]{0,31}$/;

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${path}/${key}`, 'is not supported');
  }
}

function boundedMatchValue(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string');
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0 || normalized.length > MAXIMUM_FOOTNOTE_MATCH_VALUE_UTF16_UNITS) {
    fail(path, `must contain 1-${MAXIMUM_FOOTNOTE_MATCH_VALUE_UTF16_UNITS} UTF-16 units`);
  }
  if (/\p{Cc}/u.test(normalized)) fail(path, 'must not contain control characters');
  return normalized;
}

function normalizeRule(value: unknown, index: number): FootnoteHeuristicRule {
  const path = `$/heuristicRules/${index}`;
  const input = object(value, path);
  exactKeys(input, ['fragmentPrefix', 'fragmentSuffix', 'id', 'resourceSuffix'], path);
  const id = boundedMatchValue(input.id, `${path}/id`);
  const result: FootnoteHeuristicRule = { id };
  for (const key of ['fragmentPrefix', 'fragmentSuffix', 'resourceSuffix'] as const) {
    if (input[key] !== undefined) result[key] = boundedMatchValue(input[key], `${path}/${key}`);
  }
  if (
    result.fragmentPrefix === undefined &&
    result.fragmentSuffix === undefined &&
    result.resourceSuffix === undefined
  ) {
    fail(path, 'must contain at least one match field');
  }
  return result;
}

export function normalizeFootnotePolicy(value?: FootnotePolicy): ResolvedFootnotePolicy {
  if (value === undefined) {
    return { heuristicRules: [], mode: DEFAULT_FOOTNOTE_POLICY.mode };
  }
  const input = object(value, '$');
  exactKeys(input, ['heuristicRules', 'mode'], '$');
  if (typeof input.mode !== 'string' || !modeValues.has(input.mode)) {
    fail('$/mode', `must be one of ${FOOTNOTE_POLICY_MODES.join(', ')}`);
  }
  const rawRules = input.heuristicRules ?? [];
  if (!Array.isArray(rawRules)) fail('$/heuristicRules', 'must be an array');
  if (rawRules.length > MAXIMUM_FOOTNOTE_HEURISTIC_RULES) {
    fail('$/heuristicRules', `must contain at most ${MAXIMUM_FOOTNOTE_HEURISTIC_RULES} rules`);
  }
  const heuristicRules = rawRules.map(normalizeRule);
  const ids = new Set<string>();
  for (const [index, rule] of heuristicRules.entries()) {
    if (ids.has(rule.id)) fail(`$/heuristicRules/${index}/id`, 'must be unique');
    ids.add(rule.id);
  }
  return { heuristicRules, mode: input.mode as ResolvedFootnotePolicy['mode'] };
}

function normalizeScheme(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string');
  const scheme = value.trim().toLowerCase();
  if (!schemePattern.test(scheme)) fail(path, 'must be a valid URI scheme without a colon');
  return scheme;
}

export function normalizeReaderLinkPolicy(value?: ReaderLinkPolicy): ResolvedReaderLinkPolicy {
  if (value === undefined) {
    return {
      allowedExternalSchemes: [...DEFAULT_READER_LINK_POLICY.allowedExternalSchemes],
      externalLinks: DEFAULT_READER_LINK_POLICY.externalLinks,
      unsupportedSchemes: DEFAULT_READER_LINK_POLICY.unsupportedSchemes,
    };
  }
  const input = object(value, '$');
  exactKeys(input, ['allowedExternalSchemes', 'externalLinks', 'unsupportedSchemes'], '$');
  const rawSchemes =
    input.allowedExternalSchemes ?? DEFAULT_READER_LINK_POLICY.allowedExternalSchemes;
  if (!Array.isArray(rawSchemes)) fail('$/allowedExternalSchemes', 'must be an array');
  if (rawSchemes.length > MAXIMUM_EXTERNAL_LINK_SCHEMES) {
    fail(
      '$/allowedExternalSchemes',
      `must contain at most ${MAXIMUM_EXTERNAL_LINK_SCHEMES} schemes`
    );
  }
  const allowedExternalSchemes = rawSchemes.map((scheme, index) =>
    normalizeScheme(scheme, `$/allowedExternalSchemes/${index}`)
  );
  if (new Set(allowedExternalSchemes).size !== allowedExternalSchemes.length) {
    fail('$/allowedExternalSchemes', 'must not contain duplicates');
  }
  const externalLinks = input.externalLinks ?? DEFAULT_READER_LINK_POLICY.externalLinks;
  if (typeof externalLinks !== 'string' || !externalValues.has(externalLinks)) {
    fail('$/externalLinks', `must be one of ${EXTERNAL_LINK_POLICIES.join(', ')}`);
  }
  const unsupportedSchemes =
    input.unsupportedSchemes ?? DEFAULT_READER_LINK_POLICY.unsupportedSchemes;
  if (typeof unsupportedSchemes !== 'string' || !unsupportedValues.has(unsupportedSchemes)) {
    fail('$/unsupportedSchemes', `must be one of ${UNSUPPORTED_SCHEME_POLICIES.join(', ')}`);
  }
  return {
    allowedExternalSchemes,
    externalLinks: externalLinks as ResolvedReaderLinkPolicy['externalLinks'],
    unsupportedSchemes: unsupportedSchemes as ResolvedReaderLinkPolicy['unsupportedSchemes'],
  };
}

function hrefParts(href: string): { fragment: string; resource: string } {
  const fragmentIndex = href.indexOf('#');
  const resourceWithQuery = fragmentIndex < 0 ? href : href.slice(0, fragmentIndex);
  return {
    fragment: fragmentIndex < 0 ? '' : href.slice(fragmentIndex + 1),
    resource: resourceWithQuery.split('?', 1)[0] ?? '',
  };
}

function matchesRule(rule: FootnoteHeuristicRule, parts: ReturnType<typeof hrefParts>): boolean {
  return (
    (rule.fragmentPrefix === undefined || parts.fragment.startsWith(rule.fragmentPrefix)) &&
    (rule.fragmentSuffix === undefined || parts.fragment.endsWith(rule.fragmentSuffix)) &&
    (rule.resourceSuffix === undefined || parts.resource.endsWith(rule.resourceSuffix))
  );
}

function matchesConservativeHeuristic(parts: ReturnType<typeof hrefParts>): boolean {
  if (parts.fragment.length === 0 || parts.resource.length === 0) return false;
  const resourceName = parts.resource.split('/').at(-1) ?? '';
  const noteResource = /^(?:foot[-_.]?)?notes?(?:[-_.].*)?$/i.test(resourceName);
  const noteFragment = /^(?:fn|footnote|note)(?:[-_.:]|\d)/i.test(parts.fragment);
  return noteResource && noteFragment;
}

export function decideInternalFootnote(
  policy: ResolvedFootnotePolicy,
  href: string,
  semantic: boolean
): InternalFootnoteDecision {
  if (policy.mode === 'navigate') return { decision: 'navigate' };
  if (semantic) return { classification: 'semantic', decision: 'emit' };
  if (policy.mode !== 'semantic-and-heuristic') return { decision: 'navigate' };
  const parts = hrefParts(href);
  const rule = policy.heuristicRules.find((candidate) => matchesRule(candidate, parts));
  if (rule) return { classification: 'heuristic', decision: 'emit', ruleId: rule.id };
  return matchesConservativeHeuristic(parts)
    ? { classification: 'heuristic', decision: 'emit' }
    : { decision: 'navigate' };
}

export function decideExternalLink(
  policy: ResolvedReaderLinkPolicy,
  href: string
): ExternalLinkDecision {
  const separator = href.indexOf(':');
  const scheme = separator <= 0 ? undefined : href.slice(0, separator).toLowerCase();
  const supported = scheme !== undefined && policy.allowedExternalSchemes.includes(scheme);
  if (supported) {
    return {
      disposition: policy.externalLinks === 'intercept' ? 'intercepted' : 'blocked',
      kind: 'external',
      scheme,
    };
  }
  return {
    disposition: policy.unsupportedSchemes === 'intercept' ? 'intercepted' : 'blocked',
    kind: 'unsupported',
    ...(scheme === undefined ? {} : { scheme }),
  };
}
