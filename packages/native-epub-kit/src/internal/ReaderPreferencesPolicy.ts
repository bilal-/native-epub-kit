import {
  PUBLICATION_LAYOUTS,
  READER_LAYOUTS,
  READER_PREFERENCE_NAMES,
  READER_PREFERENCE_PROGRESSIONS,
  READER_SPREADS,
  READER_TEXT_ALIGNMENTS,
  READER_THEMES,
  type PublicationLayout,
  type ReaderPreferenceName,
  type ReaderPreferenceSupport,
  type ReaderPreferences,
  type ReaderPreferencesStatus,
  type ResolvedReaderPreferences,
} from '../records.ts';

export const DEFAULT_READER_PREFERENCES: Readonly<ResolvedReaderPreferences> = {
  fontSize: 1,
  layout: 'scrolled',
  lineHeight: 1.2,
  pageMargins: 1,
  publisherStyles: true,
  readingProgression: 'auto',
  spread: 'auto',
  textAlignment: 'auto',
  theme: 'light',
};

export const READER_PREFERENCE_RANGES = {
  fontSize: { maximum: 5, minimum: 0.1 },
  lineHeight: { maximum: 2, minimum: 1 },
  pageMargins: { maximum: 4, minimum: 0 },
} as const;

const preferenceNames = new Set<string>(READER_PREFERENCE_NAMES);

export function normalizeReaderPreferences(
  preferences?: ReaderPreferences
): ResolvedReaderPreferences {
  if (preferences === undefined) return { ...DEFAULT_READER_PREFERENCES };
  assertRecord(preferences, 'Reader preferences');
  const input = preferences as ReaderPreferences;
  for (const key of Object.keys(input)) {
    if (!preferenceNames.has(key)) throw new TypeError(`Unknown reader preference: ${key}.`);
  }
  return {
    fontSize: readRange(input.fontSize, DEFAULT_READER_PREFERENCES.fontSize, 'fontSize'),
    layout: readEnum(input.layout, DEFAULT_READER_PREFERENCES.layout, READER_LAYOUTS),
    lineHeight: readRange(input.lineHeight, DEFAULT_READER_PREFERENCES.lineHeight, 'lineHeight'),
    pageMargins: readRange(
      input.pageMargins,
      DEFAULT_READER_PREFERENCES.pageMargins,
      'pageMargins'
    ),
    publisherStyles: readBoolean(
      input.publisherStyles,
      DEFAULT_READER_PREFERENCES.publisherStyles,
      'publisherStyles'
    ),
    readingProgression: readEnum(
      input.readingProgression,
      DEFAULT_READER_PREFERENCES.readingProgression,
      READER_PREFERENCE_PROGRESSIONS
    ),
    spread: readEnum(input.spread, DEFAULT_READER_PREFERENCES.spread, READER_SPREADS),
    textAlignment: readEnum(
      input.textAlignment,
      DEFAULT_READER_PREFERENCES.textAlignment,
      READER_TEXT_ALIGNMENTS
    ),
    theme: readEnum(input.theme, DEFAULT_READER_PREFERENCES.theme, READER_THEMES),
  };
}

export function readerPreferencePolicy(
  requested: ResolvedReaderPreferences,
  publicationLayout: PublicationLayout
): Pick<ReaderPreferencesStatus, 'applied' | 'support' | 'warnings'> {
  const support = READER_PREFERENCE_NAMES.map((name): ReaderPreferenceSupport => {
    if (publicationLayout === 'fixed') {
      const supported = name === 'spread' || name === 'readingProgression';
      return supported
        ? { name, supported: true }
        : { name, reason: 'fixed-layout', supported: false };
    }
    if (name === 'spread') {
      return { name, reason: 'reflowable-layout', supported: false };
    }
    if (requested.publisherStyles && (name === 'lineHeight' || name === 'textAlignment')) {
      return { name, reason: 'publisher-styles', supported: false };
    }
    return { name, supported: true };
  });
  const applied: Partial<ResolvedReaderPreferences> = {};
  for (const capability of support) {
    if (capability.supported) assignPreference(applied, requested, capability.name);
  }
  const warnings =
    publicationLayout === 'fixed'
      ? ['fixed-layout-reflow-preferences-disabled']
      : [
          'spread-fixed-layout-only',
          ...(requested.publisherStyles ? ['publisher-styles-disable-advanced-text'] : []),
        ];
  return { applied, support, warnings };
}

export function parseReaderPreferencesStatus(value: unknown): ReaderPreferencesStatus {
  assertRecord(value, 'Reader preference status');
  const requested = parseResolvedPreferences(value.requested, 'requested');
  const publicationLayout = readRequiredEnum(
    value.publicationLayout,
    'publicationLayout',
    PUBLICATION_LAYOUTS
  );
  assertRecord(value.applied, 'Reader preference status applied');
  const applied: Partial<ResolvedReaderPreferences> = {};
  for (const key of Object.keys(value.applied)) {
    if (!preferenceNames.has(key)) throw new TypeError(`Unknown applied preference: ${key}.`);
    assignParsedPreference(applied, key as ReaderPreferenceName, value.applied[key]);
  }
  if (!Array.isArray(value.support) || value.support.length !== READER_PREFERENCE_NAMES.length) {
    throw new TypeError('Reader preference support must describe every preference once.');
  }
  const seen = new Set<string>();
  const support = value.support.map((item): ReaderPreferenceSupport => {
    assertRecord(item, 'Reader preference support item');
    const name = readRequiredEnum(item.name, 'support.name', READER_PREFERENCE_NAMES);
    if (seen.has(name)) throw new TypeError(`Duplicate reader preference support: ${name}.`);
    seen.add(name);
    if (typeof item.supported !== 'boolean') {
      throw new TypeError('Reader preference support flag must be a boolean.');
    }
    if (item.supported) {
      if (item.reason !== undefined) {
        throw new TypeError('Supported reader preferences cannot have a reason.');
      }
      return { name, supported: true };
    }
    const reason = readRequiredEnum(item.reason, 'support.reason', [
      'fixed-layout',
      'publisher-styles',
      'reflowable-layout',
    ] as const);
    return { name, reason, supported: false };
  });
  const supportedNames = new Set(support.filter((item) => item.supported).map((item) => item.name));
  const appliedNames = Object.keys(applied) as ReaderPreferenceName[];
  if (
    appliedNames.length !== supportedNames.size ||
    appliedNames.some((name) => !supportedNames.has(name))
  ) {
    throw new TypeError('Applied reader preferences must exactly match supported preferences.');
  }
  for (const name of appliedNames) {
    if (applied[name] !== requested[name]) {
      throw new TypeError(`Applied reader preference ${name} must equal its requested value.`);
    }
  }
  if (!Array.isArray(value.warnings) || !value.warnings.every((item) => typeof item === 'string')) {
    throw new TypeError('Reader preference warnings must be strings.');
  }
  if (!Number.isSafeInteger(value.generation) || (value.generation as number) < 0) {
    throw new TypeError('Reader preference generation must be a non-negative safe integer.');
  }
  if (typeof value.instanceId !== 'string' || value.instanceId.length === 0) {
    throw new TypeError('Reader preference instanceId must be a non-empty string.');
  }
  return {
    applied,
    generation: value.generation as number,
    instanceId: value.instanceId,
    publicationLayout,
    requested,
    support,
    warnings: [...value.warnings],
  };
}

function parseResolvedPreferences(value: unknown, context: string): ResolvedReaderPreferences {
  assertRecord(value, `Reader preferences ${context}`);
  if (
    Object.keys(value).length !== READER_PREFERENCE_NAMES.length ||
    READER_PREFERENCE_NAMES.some((name) => !Object.hasOwn(value, name))
  ) {
    throw new TypeError(`Reader preferences ${context} must contain every normalized field.`);
  }
  return normalizeReaderPreferences(value as ReaderPreferences);
}

function assignParsedPreference(
  target: Partial<ResolvedReaderPreferences>,
  name: ReaderPreferenceName,
  value: unknown
) {
  const normalized = normalizeReaderPreferences({ [name]: value } as ReaderPreferences);
  assignPreference(target, normalized, name);
}

function assignPreference(
  target: Partial<ResolvedReaderPreferences>,
  source: ResolvedReaderPreferences,
  name: ReaderPreferenceName
) {
  Object.assign(target, { [name]: source[name] });
}

function readRange(
  value: number | undefined,
  fallback: number,
  name: keyof typeof READER_PREFERENCE_RANGES
): number {
  if (value === undefined) return fallback;
  const range = READER_PREFERENCE_RANGES[name];
  if (!Number.isFinite(value) || value < range.minimum || value > range.maximum) {
    throw new RangeError(
      `Reader preference ${name} must be within ${range.minimum}...${range.maximum}.`
    );
  }
  return value;
}

function readBoolean(value: boolean | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new TypeError(`Reader preference ${name} must be boolean.`);
  return value;
}

function readEnum<const T extends readonly string[]>(
  value: T[number] | undefined,
  fallback: T[number],
  allowed: T
): T[number] {
  if (value === undefined) return fallback;
  return readRequiredEnum(value, 'preference', allowed);
}

function readRequiredEnum<const T extends readonly string[]>(
  value: unknown,
  context: string,
  allowed: T
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new TypeError(`${context} must be one of ${allowed.join(', ')}.`);
  }
  return value as T[number];
}

function assertRecord(value: unknown, context: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object.`);
  }
}
