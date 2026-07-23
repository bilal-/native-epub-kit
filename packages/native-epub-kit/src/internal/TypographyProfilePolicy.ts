import {
  TYPOGRAPHY_PUBLISHER_STYLE_MODES,
  type ResolvedTypographyProfile,
  type ReaderColorProfile,
  type TypographyProfile,
  type TypographyRule,
  type TypographyRuleTarget,
} from '../records.ts';

export const MAXIMUM_TYPOGRAPHY_RULES = 32;
export const MAXIMUM_TYPOGRAPHY_FONT_FAMILIES = 8;
export const TYPOGRAPHY_LINE_HEIGHT_RANGE = { maximum: 4, minimum: 0.5 } as const;
export const TYPOGRAPHY_FONT_WEIGHT_RANGE = { maximum: 1000, minimum: 1 } as const;

export const TYPOGRAPHY_GENERIC_FONT_FAMILIES = [
  'cursive',
  'fantasy',
  'monospace',
  'sans-serif',
  'serif',
  'system-ui',
] as const;

const profileKeys = ['colors', 'defaultFontFamilies', 'publisherStyles', 'rules'] as const;
const colorKeys = ['background', 'link', 'text'] as const;
const ruleKeys = [
  'color',
  'direction',
  'fontFamilies',
  'fontWeight',
  'lineHeight',
  'target',
] as const;
const targetKeys = ['kind', 'value'] as const;
const languagePattern = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const classPattern = /^[_A-Za-z][_A-Za-z0-9-]*$/;
const colorPattern = /^#[0-9A-Fa-f]{6}$/;
const genericFamilies = new Set<string>(TYPOGRAPHY_GENERIC_FONT_FAMILIES);

export interface TypographyProfileValidation {
  profile: ResolvedTypographyProfile | null;
  status: 'absent' | 'invalid' | 'valid';
  stylesheet: string;
}

/** Reference policy mirrored exactly by the Swift and Kotlin adapters. */
export function validateTypographyProfile(
  input: unknown,
  availableFontFamilies?: ReadonlySet<string>
): TypographyProfileValidation {
  if (input === null || input === undefined) return emptyValidation('absent');
  try {
    const profile = normalizeTypographyProfile(input as TypographyProfile, availableFontFamilies);
    return { profile, status: 'valid', stylesheet: typographyProfileStylesheet(profile) };
  } catch {
    return emptyValidation('invalid');
  }
}

/** Validates, normalizes, and detaches one public profile atomically. */
export function normalizeTypographyProfile(
  input: TypographyProfile,
  availableFontFamilies?: ReadonlySet<string>
): ResolvedTypographyProfile {
  assertRecord(input, 'Typography profile');
  assertAllowedKeys(input, profileKeys, 'Typography profile');
  if (!TYPOGRAPHY_PUBLISHER_STYLE_MODES.includes(input.publisherStyles)) {
    throw new TypeError('Typography profile publisherStyles is invalid.');
  }
  const defaultFontFamilies = readFontFamilies(
    input.defaultFontFamilies,
    'Typography profile defaultFontFamilies',
    availableFontFamilies
  );
  if (input.rules !== undefined && !Array.isArray(input.rules)) {
    throw new TypeError('Typography profile rules must be an array.');
  }
  const rawRules = input.rules ?? [];
  if (rawRules.length > MAXIMUM_TYPOGRAPHY_RULES) {
    throw new TypeError(`Typography profile supports at most ${MAXIMUM_TYPOGRAPHY_RULES} rules.`);
  }
  const rules = rawRules.map((rule, index) => normalizeRule(rule, index, availableFontFamilies));
  const colors = input.colors === undefined ? undefined : normalizeColors(input.colors);
  return {
    ...(colors === undefined ? {} : { colors }),
    defaultFontFamilies,
    publisherStyles: input.publisherStyles,
    rules,
  };
}

/** Compiles only closed, escaped selectors and declarations; no raw CSS is accepted. */
export function typographyProfileStylesheet(profile: ResolvedTypographyProfile): string {
  if (profile.publisherStyles === 'preserve') return '';
  const lines: string[] = [];
  if (profile.colors !== undefined) {
    lines.push(
      `:root, body { background-color: ${profile.colors.background} !important; color: ${profile.colors.text} !important; }`,
      `:root a:link:link:link, :root a:link:link:link *, :root a:visited:visited:visited, :root a:visited:visited:visited * { color: ${profile.colors.link} !important; }`
    );
  }
  if (profile.publisherStyles === 'override' && profile.defaultFontFamilies.length > 0) {
    lines.push(
      `:root, body, body * { font-family: ${fontFamilyList(profile.defaultFontFamilies)} !important; }`
    );
  }
  for (const rule of profile.rules) {
    const declarations: string[] = [];
    const families = rule.fontFamilies ?? profile.defaultFontFamilies;
    if (families.length > 0) {
      declarations.push(`font-family: ${fontFamilyList(families)} !important;`);
    }
    if (rule.color !== undefined) {
      declarations.push(`color: ${rule.color} !important;`);
    }
    if (rule.direction !== undefined) {
      declarations.push(`direction: ${rule.direction} !important;`);
    }
    if (rule.lineHeight !== undefined) {
      declarations.push(`line-height: ${formatNumber(rule.lineHeight)} !important;`);
    }
    if (rule.fontWeight !== undefined) {
      declarations.push(`font-weight: ${rule.fontWeight} !important;`);
    }
    lines.push(`${selector(rule.target)} { ${declarations.join(' ')} }`);
  }
  return lines.join('\n');
}

function normalizeRule(
  input: unknown,
  index: number,
  availableFontFamilies?: ReadonlySet<string>
): TypographyRule {
  assertRecord(input, `Typography rule ${index}`);
  assertAllowedKeys(input, ruleKeys, `Typography rule ${index}`);
  const target = normalizeTarget(input.target, index);
  const rule: TypographyRule = { target };
  if (input.color !== undefined) {
    rule.color = normalizeColor(input.color, `Typography rule ${index} color`);
  }
  if (input.fontFamilies !== undefined) {
    const families = readFontFamilies(
      input.fontFamilies,
      `Typography rule ${index} fontFamilies`,
      availableFontFamilies
    );
    if (families.length === 0) {
      throw new TypeError(`Typography rule ${index} fontFamilies must not be empty.`);
    }
    rule.fontFamilies = families;
  }
  if (input.direction !== undefined) {
    if (input.direction !== 'ltr' && input.direction !== 'rtl') {
      throw new TypeError(`Typography rule ${index} direction is invalid.`);
    }
    rule.direction = input.direction;
  }
  if (input.lineHeight !== undefined) {
    rule.lineHeight = readFiniteNumber(
      input.lineHeight,
      TYPOGRAPHY_LINE_HEIGHT_RANGE,
      `Typography rule ${index} lineHeight`
    );
  }
  if (input.fontWeight !== undefined) {
    const weight = readFiniteNumber(
      input.fontWeight,
      TYPOGRAPHY_FONT_WEIGHT_RANGE,
      `Typography rule ${index} fontWeight`
    );
    if (!Number.isInteger(weight)) {
      throw new TypeError(`Typography rule ${index} fontWeight must be an integer.`);
    }
    rule.fontWeight = weight;
  }
  if (
    rule.color === undefined &&
    rule.fontFamilies === undefined &&
    rule.direction === undefined &&
    rule.lineHeight === undefined &&
    rule.fontWeight === undefined
  ) {
    throw new TypeError(`Typography rule ${index} must contain a declaration.`);
  }
  return rule;
}

function normalizeColors(input: unknown): ReaderColorProfile {
  assertRecord(input, 'Typography colors');
  if (
    Object.keys(input).length !== colorKeys.length ||
    colorKeys.some((key) => !Object.hasOwn(input, key))
  ) {
    throw new TypeError('Typography colors must contain background, link, and text.');
  }
  assertAllowedKeys(input, colorKeys, 'Typography colors');
  return {
    background: normalizeColor(input.background, 'Typography colors background'),
    link: normalizeColor(input.link, 'Typography colors link'),
    text: normalizeColor(input.text, 'Typography colors text'),
  };
}

function normalizeColor(input: unknown, path: string): string {
  if (typeof input !== 'string' || !colorPattern.test(input)) {
    throw new TypeError(`${path} must use #RRGGBB notation.`);
  }
  return input.toUpperCase();
}

function normalizeTarget(input: unknown, index: number): TypographyRuleTarget {
  assertRecord(input, `Typography rule ${index} target`);
  assertAllowedKeys(input, targetKeys, `Typography rule ${index} target`);
  if (input.kind === 'language') {
    if (typeof input.value !== 'string' || !languagePattern.test(input.value)) {
      throw new TypeError(`Typography rule ${index} language target is invalid.`);
    }
    return { kind: 'language', value: input.value.toLowerCase() };
  }
  if (input.kind === 'direction') {
    if (input.value !== 'ltr' && input.value !== 'rtl') {
      throw new TypeError(`Typography rule ${index} direction target is invalid.`);
    }
    return { kind: 'direction', value: input.value };
  }
  if (input.kind === 'class') {
    if (
      typeof input.value !== 'string' ||
      input.value.length > 64 ||
      !classPattern.test(input.value)
    ) {
      throw new TypeError(`Typography rule ${index} class target is invalid.`);
    }
    return { kind: 'class', value: input.value };
  }
  throw new TypeError(`Typography rule ${index} target kind is invalid.`);
}

function readFontFamilies(
  input: unknown,
  path: string,
  availableFontFamilies?: ReadonlySet<string>
): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > MAXIMUM_TYPOGRAPHY_FONT_FAMILIES) {
    throw new TypeError(`${path} must contain at most ${MAXIMUM_TYPOGRAPHY_FONT_FAMILIES} names.`);
  }
  const seen = new Set<string>();
  return input.map((rawFamily) => {
    if (
      typeof rawFamily !== 'string' ||
      rawFamily.length < 1 ||
      rawFamily.length > 128 ||
      rawFamily !== rawFamily.trim() ||
      rawFamily !== rawFamily.normalize('NFC') ||
      /[\u0000-\u001f\u007f]/u.test(rawFamily) ||
      seen.has(rawFamily)
    ) {
      throw new TypeError(`${path} contains an invalid or duplicate family.`);
    }
    if (
      availableFontFamilies !== undefined &&
      !genericFamilies.has(rawFamily) &&
      !availableFontFamilies.has(rawFamily)
    ) {
      throw new TypeError(`${path} references an unavailable native family.`);
    }
    seen.add(rawFamily);
    return rawFamily;
  });
}

function selector(target: TypographyRuleTarget): string {
  switch (target.kind) {
    case 'language':
      return `:root :lang(${target.value}):lang(${target.value}), :root [lang|="${target.value}"][lang|="${target.value}"]`;
    case 'direction':
      return `:root :dir(${target.value}):dir(${target.value}), :root [dir="${target.value}"][dir="${target.value}"]`;
    case 'class':
      return `:root .${target.value}.${target.value}`;
  }
}

function fontFamilyList(families: readonly string[]): string {
  return families
    .map((family) =>
      genericFamilies.has(family)
        ? family
        : `"${family.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
    )
    .join(', ');
}

function readFiniteNumber(
  input: unknown,
  range: { maximum: number; minimum: number },
  path: string
): number {
  if (
    typeof input !== 'number' ||
    !Number.isFinite(input) ||
    input < range.minimum ||
    input > range.maximum
  ) {
    throw new TypeError(`${path} is outside its supported range.`);
  }
  return input;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function emptyValidation(status: 'absent' | 'invalid'): TypographyProfileValidation {
  return { profile: null, status, stylesheet: '' };
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string
) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError(`${path} contains an unsupported field.`);
  }
}
