import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  MAXIMUM_NATIVE_FONT_FACES,
  NATIVE_FONT_MANIFEST_SCHEMA_VERSION,
  validateNativeFontManifest,
  type NativeFontManifestValidation,
  type NativeFontPlatform,
} from './NativeFontManifest';

interface FontManifestCase {
  availableFiles: string[];
  expected: Omit<NativeFontManifestValidation, 'fonts'>;
  manifest: unknown;
  name: string;
  platform: NativeFontPlatform;
}

interface FontManifestContract {
  cases: FontManifestCase[];
  maximumFaces: number;
  schemaVersion: number;
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/font-manifest-v1/cases.json', import.meta.url),
    'utf8'
  )
) as FontManifestContract;

describe('font-manifest-v1 contract', () => {
  it('pins the schema and face bound', () => {
    expect(contract.version).toBe(1);
    expect(contract.schemaVersion).toBe(NATIVE_FONT_MANIFEST_SCHEMA_VERSION);
    expect(contract.maximumFaces).toBe(MAXIMUM_NATIVE_FONT_FACES);
  });

  for (const testCase of contract.cases) {
    it(`validates and groups ${testCase.name}`, () => {
      const result = validateNativeFontManifest(
        testCase.manifest,
        testCase.platform,
        new Set(testCase.availableFiles)
      );
      expect({
        faceCount: result.faceCount,
        families: result.families.map(({ family, faces }) => ({
          family,
          faces: faces.map(({ file, style, weight }) => ({ file, style, weight })),
        })),
        familyCount: result.familyCount,
        status: result.status,
      }).toEqual(testCase.expected);
    });
  }

  it('rejects more than the maximum number of faces atomically', () => {
    const fonts = Array.from({ length: MAXIMUM_NATIVE_FONT_FACES + 1 }, (_, index) => ({
      family: `Family ${index}`,
      file: `NativeEpubKit-${index}-Face.ttf`,
      path: `NativeEpubKit-${index}-Face.ttf`,
      style: 'normal',
      weight: 400,
    }));
    const result = validateNativeFontManifest(
      { fonts, schemaVersion: 1 },
      'ios',
      new Set(fonts.map(({ file }) => file))
    );
    expect(result).toMatchObject({ faceCount: 0, familyCount: 0, status: 'invalid' });
  });
});
