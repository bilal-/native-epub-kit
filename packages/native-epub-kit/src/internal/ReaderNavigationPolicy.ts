import {
  NAVIGATION_GESTURE_STATES,
  READER_LAYOUTS,
  READER_NAVIGATION_POLICY_NAMES,
  type HorizontalNavigationAction,
  type LogicalNavigationDirection,
  type NavigationPolicyDecision,
  type NavigationPolicyDecisionInput,
  type ReaderNavigationPolicy,
  type ReaderNavigationPolicyApplication,
  type ReaderNavigationPolicyName,
  type ReaderNavigationPolicyStatus,
  type ReaderNavigationPolicySupport,
  type ResolvedReaderNavigationPolicy,
} from '../records.ts';

export const DEFAULT_READER_NAVIGATION_POLICY: Readonly<ResolvedReaderNavigationPolicy> = {
  animatedTransitions: false,
  chapterTurnGesture: 'disabled',
  edgeTapNavigation: false,
  hardwareKeyNavigation: true,
  inputSuppressed: false,
  pageTurnGesture: 'enabled',
};

const policyNames = new Set<string>(READER_NAVIGATION_POLICY_NAMES);

function assertRecord(value: unknown, context: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object.`);
  }
}

function readBoolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new TypeError(`Reader navigation policy ${name} must be boolean.`);
  }
  return value;
}

function readGesture(
  value: unknown,
  fallback: ResolvedReaderNavigationPolicy['pageTurnGesture'],
  name: string
): ResolvedReaderNavigationPolicy['pageTurnGesture'] {
  if (value === undefined) return fallback;
  if (
    typeof value !== 'string' ||
    !NAVIGATION_GESTURE_STATES.some((candidate) => candidate === value)
  ) {
    throw new TypeError(
      `Reader navigation policy ${name} must be one of ${NAVIGATION_GESTURE_STATES.join(', ')}.`
    );
  }
  return value as ResolvedReaderNavigationPolicy['pageTurnGesture'];
}

export function normalizeReaderNavigationPolicy(
  policy?: ReaderNavigationPolicy
): ResolvedReaderNavigationPolicy {
  if (policy === undefined) return { ...DEFAULT_READER_NAVIGATION_POLICY };
  assertRecord(policy, 'Reader navigation policy');
  for (const key of Object.keys(policy)) {
    if (!policyNames.has(key)) throw new TypeError(`Unknown reader navigation policy: ${key}.`);
  }
  return {
    animatedTransitions: readBoolean(
      policy.animatedTransitions,
      DEFAULT_READER_NAVIGATION_POLICY.animatedTransitions,
      'animatedTransitions'
    ),
    chapterTurnGesture: readGesture(
      policy.chapterTurnGesture,
      DEFAULT_READER_NAVIGATION_POLICY.chapterTurnGesture,
      'chapterTurnGesture'
    ),
    edgeTapNavigation: readBoolean(
      policy.edgeTapNavigation,
      DEFAULT_READER_NAVIGATION_POLICY.edgeTapNavigation,
      'edgeTapNavigation'
    ),
    hardwareKeyNavigation: readBoolean(
      policy.hardwareKeyNavigation,
      DEFAULT_READER_NAVIGATION_POLICY.hardwareKeyNavigation,
      'hardwareKeyNavigation'
    ),
    inputSuppressed: readBoolean(
      policy.inputSuppressed,
      DEFAULT_READER_NAVIGATION_POLICY.inputSuppressed,
      'inputSuppressed'
    ),
    pageTurnGesture: readGesture(
      policy.pageTurnGesture,
      DEFAULT_READER_NAVIGATION_POLICY.pageTurnGesture,
      'pageTurnGesture'
    ),
  };
}

function applicationFor(name: ReaderNavigationPolicyName): ReaderNavigationPolicyApplication {
  return name === 'chapterTurnGesture' ? 'navigator-recreation' : 'live';
}

export function readerNavigationPolicySupport(): ReaderNavigationPolicySupport[] {
  return READER_NAVIGATION_POLICY_NAMES.map((name) => ({
    application: applicationFor(name),
    name,
    supported: true,
  }));
}

/** Maps Readium-style physical left/right actions into publication-logical movement. */
export function logicalDirectionForHorizontalAction(
  action: HorizontalNavigationAction,
  readingProgression: 'ltr' | 'rtl'
): LogicalNavigationDirection {
  if (action !== 'go-left' && action !== 'go-right') {
    throw new TypeError('Horizontal navigation action is invalid.');
  }
  if (readingProgression !== 'ltr' && readingProgression !== 'rtl') {
    throw new TypeError('Horizontal navigation reading progression is invalid.');
  }
  const rightIsForward = readingProgression === 'ltr';
  return (action === 'go-right') === rightIsForward ? 'forward' : 'backward';
}

/** Pure input decision shared by app controllers and native policy tests. */
export function readerNavigationPolicyDecision(
  policyInput: ReaderNavigationPolicy | ResolvedReaderNavigationPolicy,
  input: NavigationPolicyDecisionInput
): NavigationPolicyDecision {
  const policy = normalizeReaderNavigationPolicy(policyInput);
  if (!READER_LAYOUTS.includes(input.layout)) {
    throw new TypeError(`Navigation decision layout must be one of ${READER_LAYOUTS.join(', ')}.`);
  }
  if (input.direction !== 'forward' && input.direction !== 'backward') {
    throw new TypeError('Navigation decision direction is invalid.');
  }
  if (!['swipe', 'edge-tap', 'hardware-key'].includes(input.input)) {
    throw new TypeError('Navigation decision input source is invalid.');
  }
  if (typeof input.atChapterBoundary !== 'boolean') {
    throw new TypeError('Navigation decision chapter-boundary flag must be boolean.');
  }

  const movement = input.layout === 'scrolled' || input.atChapterBoundary ? 'chapter' : 'page';
  const base = {
    animated: policy.animatedTransitions,
    direction: input.direction,
    movement,
  } as const;
  if (policy.inputSuppressed) {
    return { ...base, action: 'ignore', reason: 'input-suppressed' };
  }
  if (input.input === 'edge-tap' && !policy.edgeTapNavigation) {
    return { ...base, action: 'ignore', reason: 'edge-taps-disabled' };
  }
  if (input.input === 'hardware-key' && !policy.hardwareKeyNavigation) {
    return { ...base, action: 'ignore', reason: 'hardware-keys-disabled' };
  }
  if (movement === 'chapter' && policy.chapterTurnGesture === 'disabled') {
    return { ...base, action: 'ignore', reason: 'chapter-turn-disabled' };
  }
  if (movement === 'page' && policy.pageTurnGesture === 'disabled') {
    return { ...base, action: 'ignore', reason: 'page-turn-disabled' };
  }
  return { ...base, action: 'navigate', reason: 'allowed' };
}

function parseResolvedPolicy(value: unknown, context: string): ResolvedReaderNavigationPolicy {
  assertRecord(value, context);
  if (
    Object.keys(value).length !== READER_NAVIGATION_POLICY_NAMES.length ||
    READER_NAVIGATION_POLICY_NAMES.some((name) => !Object.hasOwn(value, name))
  ) {
    throw new TypeError(`${context} must contain every normalized field.`);
  }
  return normalizeReaderNavigationPolicy(value as ReaderNavigationPolicy);
}

export function parseReaderNavigationPolicyStatus(value: unknown): ReaderNavigationPolicyStatus {
  assertRecord(value, 'Reader navigation policy status');
  const requested = parseResolvedPolicy(value.requested, 'Requested navigation policy');
  const applied = parseResolvedPolicy(value.applied, 'Applied navigation policy');
  if (JSON.stringify(requested) !== JSON.stringify(applied)) {
    throw new TypeError('Applied navigation policy must equal the requested policy.');
  }
  if (!['initial', 'live', 'navigator-recreation'].includes(String(value.application))) {
    throw new TypeError('Navigation policy application mode is invalid.');
  }
  if (
    value.boundaryGranularity !== 'reading-order-resource' &&
    value.boundaryGranularity !== 'navigation-unit'
  ) {
    throw new TypeError('Navigation policy boundary granularity is invalid.');
  }
  if (
    !['pending', 'continuous', 'position', 'resource'].includes(String(value.boundaryPrecision))
  ) {
    throw new TypeError('Navigation policy boundary precision is invalid.');
  }
  if (typeof value.instanceId !== 'string' || value.instanceId.length === 0) {
    throw new TypeError('Navigation policy instanceId must be a non-empty string.');
  }
  if (!Number.isSafeInteger(value.generation) || (value.generation as number) < 0) {
    throw new TypeError('Navigation policy generation must be a non-negative safe integer.');
  }
  if (!READER_LAYOUTS.includes(value.effectiveLayout as (typeof READER_LAYOUTS)[number])) {
    throw new TypeError('Navigation policy effective layout is invalid.');
  }
  if (value.readingProgression !== 'ltr' && value.readingProgression !== 'rtl') {
    throw new TypeError('Navigation policy reading progression is invalid.');
  }
  if (
    !Array.isArray(value.support) ||
    value.support.length !== READER_NAVIGATION_POLICY_NAMES.length
  ) {
    throw new TypeError('Navigation policy support must describe every field once.');
  }
  const expectedSupport = readerNavigationPolicySupport();
  const support = value.support.map((entry, index): ReaderNavigationPolicySupport => {
    assertRecord(entry, 'Navigation policy support item');
    const expected = expectedSupport[index]!;
    if (
      entry.name !== expected.name ||
      entry.supported !== true ||
      entry.application !== expected.application
    ) {
      throw new TypeError('Navigation policy support is incomplete or out of order.');
    }
    return expected;
  });
  if (!Array.isArray(value.warnings) || !value.warnings.every((item) => typeof item === 'string')) {
    throw new TypeError('Navigation policy warnings must be strings.');
  }
  return {
    application: value.application as ReaderNavigationPolicyStatus['application'],
    applied,
    boundaryGranularity: value.boundaryGranularity,
    boundaryPrecision: value.boundaryPrecision as ReaderNavigationPolicyStatus['boundaryPrecision'],
    effectiveLayout: value.effectiveLayout as ReaderNavigationPolicyStatus['effectiveLayout'],
    generation: value.generation as number,
    instanceId: value.instanceId,
    readingProgression: value.readingProgression,
    requested,
    support,
    warnings: [...value.warnings],
  };
}
