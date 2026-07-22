import { READER_FONT_MANIFEST_STATUSES, type ReaderFontManifestStatus } from '../records.ts';

export const NATIVE_FONT_MANIFEST_SCHEMA_VERSION = 1;
export const MAXIMUM_NATIVE_FONT_FACES = 64;

export type NativeFontPlatform = 'android' | 'ios';
export type NativeFontStyle = 'italic' | 'normal';

export interface NativeFontDefinition {
  family: string;
  file: string;
  path: string;
  style: NativeFontStyle;
  weight: number;
}

export interface NativeFontFamilyDefinition {
  faces: NativeFontDefinition[];
  family: string;
}

export interface NativeFontManifestValidation {
  faceCount: number;
  families: NativeFontFamilyDefinition[];
  familyCount: number;
  fonts: NativeFontDefinition[];
  status: ReaderFontManifestStatus;
}

const rootKeys = ['fonts', 'schemaVersion'] as const;
const faceKeys = ['family', 'file', 'path', 'style', 'weight'] as const;
const generatedFilePattern = /^NativeEpubKit-[0-9]+-[A-Za-z0-9_-]+\.(?:otf|ttf)$/;

/** Reference validation policy mirrored by the Swift and Kotlin adapters. */
export function validateNativeFontManifest(
  manifest: unknown,
  platform: NativeFontPlatform,
  availableFiles: ReadonlySet<string>
): NativeFontManifestValidation {
  if (manifest === null || manifest === undefined) return emptyValidation('not-configured');

  try {
    assertRecord(manifest);
    assertExactKeys(manifest, rootKeys);
    if (manifest.schemaVersion !== NATIVE_FONT_MANIFEST_SCHEMA_VERSION) throw new TypeError();
    if (!Array.isArray(manifest.fonts) || manifest.fonts.length < 1) throw new TypeError();
    if (manifest.fonts.length > MAXIMUM_NATIVE_FONT_FACES) throw new TypeError();

    const seenFaces = new Set<string>();
    const fonts = manifest.fonts.map((rawFace, index): NativeFontDefinition => {
      assertRecord(rawFace);
      assertExactKeys(rawFace, faceKeys);
      const family = readFamily(rawFace.family);
      const file = readGeneratedFile(rawFace.file, index);
      const expectedPath = platform === 'android' ? `native_epub_kit/fonts/${file}` : file;
      if (rawFace.path !== expectedPath || !availableFiles.has(expectedPath)) throw new TypeError();
      if (rawFace.style !== 'normal' && rawFace.style !== 'italic') throw new TypeError();
      if (
        typeof rawFace.weight !== 'number' ||
        !Number.isInteger(rawFace.weight) ||
        rawFace.weight < 1 ||
        rawFace.weight > 1000
      ) {
        throw new TypeError();
      }
      const key = `${family}\u0000${rawFace.weight}\u0000${rawFace.style}`;
      if (seenFaces.has(key)) throw new TypeError();
      seenFaces.add(key);
      return {
        family,
        file,
        path: expectedPath,
        style: rawFace.style,
        weight: rawFace.weight,
      };
    });
    const families = groupNativeFontFamilies(fonts);
    return {
      faceCount: fonts.length,
      families,
      familyCount: families.length,
      fonts,
      status: 'valid',
    };
  } catch {
    return emptyValidation('invalid');
  }
}

/** Groups in first-family order while retaining declaration order within each family. */
export function groupNativeFontFamilies(
  fonts: readonly NativeFontDefinition[]
): NativeFontFamilyDefinition[] {
  const families = new Map<string, NativeFontDefinition[]>();
  for (const font of fonts) {
    const faces = families.get(font.family);
    if (faces) faces.push({ ...font });
    else families.set(font.family, [{ ...font }]);
  }
  return [...families].map(([family, faces]) => ({ faces, family }));
}

function emptyValidation(status: ReaderFontManifestStatus): NativeFontManifestValidation {
  if (!READER_FONT_MANIFEST_STATUSES.includes(status)) throw new TypeError();
  return { faceCount: 0, families: [], familyCount: 0, fonts: [], status };
}

function readFamily(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) throw new TypeError();
  if (value !== value.trim() || value !== value.normalize('NFC')) throw new TypeError();
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError();
  return value;
}

function readGeneratedFile(value: unknown, index: number): string {
  if (typeof value !== 'string' || !generatedFilePattern.test(value)) throw new TypeError();
  if (!value.startsWith(`NativeEpubKit-${index}-`)) throw new TypeError();
  return value;
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError();
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new TypeError();
  }
}
