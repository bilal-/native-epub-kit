import {
  NATIVE_PLATFORMS,
  PROGRESS_PRECISIONS,
  PUBLICATION_LAYOUTS,
  READER_DIAGNOSTIC_FEATURE_NAMES,
  READER_DIAGNOSTIC_FEATURE_STAGES,
  READER_FONT_MANIFEST_STATUSES,
  READER_TOOLKIT_NAMES,
  READING_PROGRESSIONS,
  type NativePlatform,
  type PublicationLayout,
  type ReaderDiagnosticFeature,
  type ReaderDiagnosticFeatureName,
  type ReaderDiagnosticFeatureStage,
  type ReaderDiagnostics,
  type ReaderFontManifestDiagnostics,
} from '../records.ts';
import { parseReaderPreferencesStatus } from './ReaderPreferencesPolicy.ts';

export const READER_DIAGNOSTICS_SCHEMA_VERSION = 1 as const;
export const MAXIMUM_READER_DIAGNOSTIC_WARNINGS = 64;

const topLevelKeys = [
  'features',
  'fonts',
  'generation',
  'platform',
  'preferences',
  'publication',
  'redaction',
  'schemaVersion',
  'sdk',
  'toolkit',
  'warnings',
] as const;
const markerPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^[0-9A-Za-z]+(?:[.+-][0-9A-Za-z]+)*$/;
const revisionPattern = /^[0-9a-f]{40}$/;

export interface ReaderDiagnosticsPolicyInput {
  capabilities: {
    customFonts: boolean;
    decorations: boolean;
    footnotes: boolean;
    images: boolean;
    positions: boolean;
    search: boolean;
    selection: boolean;
  };
  fonts: ReaderFontManifestDiagnostics;
  layout: PublicationLayout;
  platform: NativePlatform;
}

/** Shared feature-stage policy mirrored by the two native adapters. */
export function readerDiagnosticsFeaturePolicy(
  input: ReaderDiagnosticsPolicyInput
): ReaderDiagnosticFeature[] {
  return READER_DIAGNOSTIC_FEATURE_NAMES.map((name) => ({
    enabled: featureEnabled(name, input),
    name,
    stage: featureStage(name, input.platform),
  }));
}

export function readerDiagnosticsWarnings(
  publicationWarnings: readonly string[],
  preferenceWarnings: readonly string[],
  fontStatus: ReaderFontManifestDiagnostics['status']
): string[] {
  return canonicalWarnings([
    ...publicationWarnings,
    ...preferenceWarnings,
    ...(fontStatus === 'invalid' ? ['font-manifest-invalid'] : []),
    'remote-sources-disabled',
  ]);
}

/** Validates and detaches the private native diagnostic command payload. */
export function parseReaderDiagnostics(value: unknown): ReaderDiagnostics {
  assertRecord(value, 'Reader diagnostics');
  assertExactKeys(value, topLevelKeys, 'Reader diagnostics');
  if (value.schemaVersion !== READER_DIAGNOSTICS_SCHEMA_VERSION) {
    throw new TypeError('Reader diagnostics schemaVersion is unsupported.');
  }
  const generation = readNonNegativeInteger(value.generation, 'generation');
  const platform = readEnum(value.platform, NATIVE_PLATFORMS, 'platform');

  assertRecord(value.sdk, 'Reader diagnostics sdk');
  assertExactKeys(value.sdk, ['name', 'version'], 'Reader diagnostics sdk');
  if (value.sdk.name !== 'native-epub-kit') {
    throw new TypeError('Reader diagnostics sdk name is invalid.');
  }
  const sdkVersion = readVersion(value.sdk.version, 'sdk.version');

  assertRecord(value.toolkit, 'Reader diagnostics toolkit');
  assertExactKeys(value.toolkit, ['name', 'revision', 'version'], 'Reader diagnostics toolkit');
  const toolkitName = readEnum(value.toolkit.name, READER_TOOLKIT_NAMES, 'toolkit.name');
  const expectedToolkitName = platform === 'ios' ? 'readium-swift' : 'readium-kotlin';
  if (toolkitName !== expectedToolkitName) {
    throw new TypeError('Reader diagnostics toolkit does not match its platform.');
  }
  const toolkitVersion = readVersion(value.toolkit.version, 'toolkit.version');
  if (typeof value.toolkit.revision !== 'string' || !revisionPattern.test(value.toolkit.revision)) {
    throw new TypeError('Reader diagnostics toolkit revision must be a lowercase commit hash.');
  }

  assertRecord(value.publication, 'Reader diagnostics publication');
  assertExactKeys(
    value.publication,
    [
      'format',
      'layout',
      'mappingDurationMilliseconds',
      'positionCount',
      'progressPrecision',
      'readingProgression',
      'warnings',
    ],
    'Reader diagnostics publication'
  );
  if (value.publication.format !== 'epub') {
    throw new TypeError('Reader diagnostics publication format must be epub.');
  }
  const layout = readEnum(value.publication.layout, PUBLICATION_LAYOUTS, 'publication.layout');
  const publicationWarnings = readWarnings(value.publication.warnings, 'publication.warnings');
  const positionCount = readNonNegativeInteger(
    value.publication.positionCount,
    'publication.positionCount'
  );
  const mappingDurationMilliseconds = readNonNegativeInteger(
    value.publication.mappingDurationMilliseconds,
    'publication.mappingDurationMilliseconds'
  );
  const progressPrecision = readEnum(
    value.publication.progressPrecision,
    PROGRESS_PRECISIONS,
    'publication.progressPrecision'
  );
  const readingProgression = readEnum(
    value.publication.readingProgression,
    READING_PROGRESSIONS,
    'publication.readingProgression'
  );

  assertRecord(value.fonts, 'Reader diagnostics fonts');
  assertExactKeys(value.fonts, ['faceCount', 'familyCount', 'status'], 'Reader diagnostics fonts');
  const fontStatus = readEnum(value.fonts.status, READER_FONT_MANIFEST_STATUSES, 'fonts.status');
  const faceCount = readNonNegativeInteger(value.fonts.faceCount, 'fonts.faceCount');
  const familyCount = readNonNegativeInteger(value.fonts.familyCount, 'fonts.familyCount');
  if (
    familyCount > faceCount ||
    (fontStatus === 'not-configured' && (faceCount !== 0 || familyCount !== 0))
  ) {
    throw new TypeError('Reader diagnostics font counts are inconsistent.');
  }

  if (
    !Array.isArray(value.features) ||
    value.features.length !== READER_DIAGNOSTIC_FEATURE_NAMES.length
  ) {
    throw new TypeError('Reader diagnostics must describe every feature exactly once.');
  }
  const featureByName = new Map<ReaderDiagnosticFeatureName, ReaderDiagnosticFeature>();
  for (const rawFeature of value.features) {
    assertRecord(rawFeature, 'Reader diagnostics feature');
    assertExactKeys(rawFeature, ['enabled', 'name', 'stage'], 'Reader diagnostics feature');
    const name = readEnum(rawFeature.name, READER_DIAGNOSTIC_FEATURE_NAMES, 'feature.name');
    if (featureByName.has(name))
      throw new TypeError(`Duplicate reader diagnostic feature: ${name}.`);
    if (typeof rawFeature.enabled !== 'boolean') {
      throw new TypeError('Reader diagnostic feature enabled must be boolean.');
    }
    const stage = readEnum(rawFeature.stage, READER_DIAGNOSTIC_FEATURE_STAGES, 'feature.stage');
    if (stage !== featureStage(name, platform)) {
      throw new TypeError(`Reader diagnostic feature ${name} has an invalid stage.`);
    }
    featureByName.set(name, { enabled: rawFeature.enabled, name, stage });
  }
  const features = READER_DIAGNOSTIC_FEATURE_NAMES.map((name) => {
    const feature = featureByName.get(name);
    if (!feature) throw new TypeError(`Missing reader diagnostic feature: ${name}.`);
    return feature;
  });
  assertCoreFeatureInvariants(features, platform, layout, positionCount, fontStatus);

  assertRecord(value.preferences, 'Reader diagnostics preferences');
  assertExactKeys(
    value.preferences,
    ['applied', 'requested', 'support', 'warnings'],
    'Reader diagnostics preferences'
  );
  const preferenceStatus = parseReaderPreferencesStatus({
    ...value.preferences,
    generation,
    instanceId: 'redacted-diagnostic',
    publicationLayout: layout,
  });
  const preferenceWarnings = readWarnings(preferenceStatus.warnings, 'preferences.warnings');

  const warnings = readWarnings(value.warnings, 'warnings');
  const expectedWarnings = readerDiagnosticsWarnings(
    publicationWarnings,
    preferenceWarnings,
    fontStatus
  );
  if (JSON.stringify(warnings) !== JSON.stringify(expectedWarnings)) {
    throw new TypeError('Reader diagnostics aggregate warnings are inconsistent.');
  }

  assertRecord(value.redaction, 'Reader diagnostics redaction');
  assertExactKeys(value.redaction, ['profile'], 'Reader diagnostics redaction');
  if (value.redaction.profile !== 'support-v1') {
    throw new TypeError('Reader diagnostics redaction profile is unsupported.');
  }

  return {
    features,
    fonts: { faceCount, familyCount, status: fontStatus },
    generation,
    platform,
    preferences: {
      applied: preferenceStatus.applied,
      requested: preferenceStatus.requested,
      support: preferenceStatus.support,
      warnings: preferenceWarnings,
    },
    publication: {
      format: 'epub',
      layout,
      mappingDurationMilliseconds,
      positionCount,
      progressPrecision,
      readingProgression,
      warnings: publicationWarnings,
    },
    redaction: { profile: 'support-v1' },
    schemaVersion: READER_DIAGNOSTICS_SCHEMA_VERSION,
    sdk: { name: 'native-epub-kit', version: sdkVersion },
    toolkit: {
      name: toolkitName,
      revision: value.toolkit.revision,
      version: toolkitVersion,
    },
    warnings,
  };
}

/** Produces deterministic, bounded JSON suitable for a copied issue report. */
export function createReaderDiagnosticReport(diagnostics: ReaderDiagnostics): string {
  return `${JSON.stringify(parseReaderDiagnostics(diagnostics), null, 2)}\n`;
}

function featureStage(
  name: ReaderDiagnosticFeatureName,
  platform: NativePlatform
): ReaderDiagnosticFeatureStage {
  switch (name) {
    case 'content-uri-source':
      return platform === 'android' ? 'stable' : 'unsupported';
    case 'remote-source':
      return 'unsupported';
    case 'custom-fonts':
      return 'qualification';
    case 'decorations':
    case 'search':
      return 'stable';
    default:
      return 'stable';
  }
}

function featureEnabled(
  name: ReaderDiagnosticFeatureName,
  input: ReaderDiagnosticsPolicyInput
): boolean {
  switch (name) {
    case 'content-uri-source':
      return input.platform === 'android';
    case 'remote-source':
      return false;
    case 'positions':
      return input.capabilities.positions;
    case 'selection':
      return input.capabilities.selection;
    case 'footnotes':
      return input.capabilities.footnotes;
    case 'custom-fonts':
      return input.capabilities.customFonts && input.fonts.status === 'valid';
    case 'decorations':
      return input.capabilities.decorations;
    case 'images':
      return input.capabilities.images;
    case 'search':
      return input.capabilities.search;
    default:
      return true;
  }
}

function assertCoreFeatureInvariants(
  features: ReaderDiagnosticFeature[],
  platform: NativePlatform,
  layout: PublicationLayout,
  positionCount: number,
  fontStatus: ReaderFontManifestDiagnostics['status']
) {
  const enabled = (name: ReaderDiagnosticFeatureName) =>
    features.find((feature) => feature.name === name)?.enabled;
  for (const name of [
    'local-file-source',
    'publication-data',
    'navigation',
    'restore',
    'preferences',
    'progress',
    'diagnostics',
  ] as const) {
    if (!enabled(name))
      throw new TypeError(`Reader diagnostic core feature ${name} must be enabled.`);
  }
  if (enabled('content-uri-source') !== (platform === 'android') || enabled('remote-source')) {
    throw new TypeError('Reader diagnostic source features are inconsistent.');
  }
  if (enabled('positions') !== positionCount > 0) {
    throw new TypeError('Reader diagnostic positions feature is inconsistent.');
  }
  const expectedFonts = layout === 'reflowable' && fontStatus === 'valid';
  if (enabled('custom-fonts') !== expectedFonts) {
    throw new TypeError('Reader diagnostic custom-font feature is inconsistent.');
  }
}

function readWarnings(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.length > MAXIMUM_READER_DIAGNOSTIC_WARNINGS) {
    throw new TypeError(`Reader diagnostics ${context} exceeds its warning limit.`);
  }
  if (
    !value.every(
      (warning) =>
        typeof warning === 'string' && warning.length <= 64 && markerPattern.test(warning)
    )
  ) {
    throw new TypeError(`Reader diagnostics ${context} contains an invalid warning marker.`);
  }
  const canonical = canonicalWarnings(value as string[]);
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new TypeError(`Reader diagnostics ${context} must be sorted and unique.`);
  }
  return canonical;
}

function canonicalWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings)].sort().slice(0, MAXIMUM_READER_DIAGNOSTIC_WARNINGS);
}

function readVersion(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.length > 64 || !versionPattern.test(value)) {
    throw new TypeError(`Reader diagnostics ${context} is invalid.`);
  }
  return value;
}

function readNonNegativeInteger(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`Reader diagnostics ${context} must be a non-negative safe integer.`);
  }
  return value as number;
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  context: string
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new TypeError(`Reader diagnostics ${context} is invalid.`);
  }
  return value as T[number];
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  context: string
) {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected)) {
    throw new TypeError(`${context} contains missing or unknown fields.`);
  }
}

function assertRecord(value: unknown, context: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object.`);
  }
}
