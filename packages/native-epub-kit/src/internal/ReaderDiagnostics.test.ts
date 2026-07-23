import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type {
  NativePlatform,
  ProgressPrecision,
  PublicationLayout,
  ReaderDiagnosticFeatureName,
  ReaderDiagnosticFeatureStage,
  ReaderFontManifestDiagnostics,
  ReaderPreferences,
  ReaderToolkitDiagnostics,
  ReadingProgression,
} from '../records';
import {
  createReaderDiagnosticReport,
  parseReaderDiagnostics,
  readerDiagnosticsFeaturePolicy,
  readerDiagnosticsWarnings,
} from './ReaderDiagnostics';
import { normalizeReaderPreferences, readerPreferencePolicy } from './ReaderPreferencesPolicy';

interface DiagnosticsContractCase {
  expected: {
    enabled: ReaderDiagnosticFeatureName[];
    stages: Record<ReaderDiagnosticFeatureName, ReaderDiagnosticFeatureStage>;
    warnings: string[];
  };
  fonts: ReaderFontManifestDiagnostics;
  name: string;
  platform: NativePlatform;
  preferences: ReaderPreferences;
  publication: {
    capabilities: {
      customFonts: boolean;
      decorations: boolean;
      footnotes: boolean;
      images: boolean;
      positions: boolean;
      search: boolean;
      selection: boolean;
    };
    layout: PublicationLayout;
    mappingDurationMilliseconds: number;
    positionCount: number;
    progressPrecision: ProgressPrecision;
    readingProgression: ReadingProgression;
    warnings: string[];
  };
  toolkit: ReaderToolkitDiagnostics;
}

interface DiagnosticsContract {
  cases: DiagnosticsContractCase[];
  featureNames: ReaderDiagnosticFeatureName[];
  limits: { maximumWarnings: number };
  redaction: {
    forbiddenFragments: string[];
    forbiddenKeys: string[];
    profile: 'support-v1';
  };
  schemaVersion: 1;
  sdk: { name: 'native-epub-kit'; version: string };
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/diagnostics-v1/cases.json', import.meta.url),
    'utf8'
  )
) as DiagnosticsContract;

function payloadFor(testCase: DiagnosticsContractCase) {
  const requested = normalizeReaderPreferences(testCase.preferences);
  const preferences = readerPreferencePolicy(requested, testCase.publication.layout);
  const publicationWarnings = [...testCase.publication.warnings].sort();
  const preferenceWarnings = [...preferences.warnings].sort();
  return {
    features: readerDiagnosticsFeaturePolicy({
      capabilities: testCase.publication.capabilities,
      fonts: testCase.fonts,
      layout: testCase.publication.layout,
      platform: testCase.platform,
    }),
    fonts: testCase.fonts,
    generation: 7,
    platform: testCase.platform,
    preferences: { ...preferences, requested, warnings: preferenceWarnings },
    publication: {
      format: 'epub',
      layout: testCase.publication.layout,
      mappingDurationMilliseconds: testCase.publication.mappingDurationMilliseconds,
      positionCount: testCase.publication.positionCount,
      progressPrecision: testCase.publication.progressPrecision,
      readingProgression: testCase.publication.readingProgression,
      warnings: publicationWarnings,
    },
    redaction: { profile: contract.redaction.profile },
    schemaVersion: contract.schemaVersion,
    sdk: contract.sdk,
    toolkit: testCase.toolkit,
    warnings: readerDiagnosticsWarnings(
      publicationWarnings,
      preferenceWarnings,
      testCase.fonts.status
    ),
  };
}

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]);
}

describe('diagnostics-v1 contract', () => {
  it('pins the schema, feature order, warning bound, and SDK identity', () => {
    expect(contract.version).toBe(1);
    expect(contract.schemaVersion).toBe(1);
    expect(contract.featureNames).toHaveLength(16);
    expect(contract.limits.maximumWarnings).toBe(64);
    expect(contract.sdk).toEqual({ name: 'native-epub-kit', version: '0.1.0' });
  });

  for (const testCase of contract.cases) {
    it(`maps, validates, and redacts ${testCase.name}`, () => {
      const diagnostics = parseReaderDiagnostics(payloadFor(testCase));
      expect(diagnostics.features.map(({ name }) => name)).toEqual(contract.featureNames);
      expect(diagnostics.features.filter(({ enabled }) => enabled).map(({ name }) => name)).toEqual(
        testCase.expected.enabled
      );
      expect(
        Object.fromEntries(diagnostics.features.map(({ name, stage }) => [name, stage]))
      ).toEqual(testCase.expected.stages);
      expect(diagnostics.warnings).toEqual(testCase.expected.warnings);

      const report = createReaderDiagnosticReport(diagnostics);
      expect(report).toBe(`${JSON.stringify(diagnostics, null, 2)}\n`);
      expect(report).not.toContain('fixture.epub');
      for (const fragment of contract.redaction.forbiddenFragments) {
        expect(report).not.toContain(fragment);
      }
      const keys = allKeys(JSON.parse(report));
      for (const key of contract.redaction.forbiddenKeys) expect(keys).not.toContain(key);
    });
  }

  it('rejects unknown fields, mismatched native identity, and non-canonical warnings', () => {
    const valid = payloadFor(contract.cases[0]!);
    expect(() => parseReaderDiagnostics({ ...valid, source: 'file:///secret.epub' })).toThrow(
      'unknown fields'
    );
    expect(() =>
      parseReaderDiagnostics({
        ...valid,
        toolkit: { ...valid.toolkit, name: 'readium-kotlin' },
      })
    ).toThrow('does not match');
    expect(() =>
      parseReaderDiagnostics({ ...valid, warnings: [...valid.warnings].reverse() })
    ).toThrow('sorted and unique');
  });

  it('rejects inconsistent features, font counts, and aggregate warnings', () => {
    const valid = payloadFor(contract.cases[0]!);
    expect(() =>
      parseReaderDiagnostics({
        ...valid,
        features: valid.features.map((feature) =>
          feature.name === 'diagnostics' ? { ...feature, enabled: false } : feature
        ),
      })
    ).toThrow('must be enabled');
    expect(() =>
      parseReaderDiagnostics({
        ...valid,
        fonts: { faceCount: 0, familyCount: 1, status: 'valid' },
      })
    ).toThrow('font counts');
    expect(() => parseReaderDiagnostics({ ...valid, warnings: [] })).toThrow('aggregate warnings');
  });
});
