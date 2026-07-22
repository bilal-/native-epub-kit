import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  NativeEpubKitError,
  RecordValidationError,
  mapNativeReaderError,
  parseCoreRecord,
  parseLocator,
  parsePublicationInfo,
  parsePublicationPositionsPage,
  parseReaderError,
  parseReaderGeometry,
  parseReaderImageActivationEvent,
  parseReaderResolvedImageSource,
  parseReaderLocationEvent,
  parseReaderLinkEvent,
  serializeCoreRecord,
  parseReaderSelectionActionEvent,
  parseReaderSelectionChangeEvent,
  parseReaderSelectionSnapshot,
} from './recordValidation';
import {
  CORE_RECORD_NULLABILITY,
  CORE_RECORD_UNITS,
  DECORATION_STYLE_TYPES,
  FOOTNOTE_CLASSIFICATIONS,
  NATIVE_PLATFORMS,
  NAVIGATION_UNIT_SOURCES,
  PROGRESS_PRECISIONS,
  PUBLICATION_LAYOUTS,
  PUBLICATION_SOURCE_KINDS,
  READER_ERROR_CODES,
  READER_ERROR_PHASES,
  READER_IMAGE_SOURCE_KINDS,
  READER_IMAGE_UNRESOLVED_REASONS,
  READER_LOCATION_REASONS,
  READER_LINK_DISPOSITIONS,
  READER_LINK_KINDS,
  READER_SELECTION_CHANGE_REASONS,
  READING_PROGRESSIONS,
  TEXT_DIRECTIONS,
  type CoreRecordType,
  type JsonObject,
} from './records';

const contractRoot = new URL('../../testing/contracts/core-v1/', import.meta.url);
const casesDirectory = fileURLToPath(new URL('cases/', contractRoot));

interface GoldenEnvelope {
  caseId: string;
  payload: JsonObject;
  recordType: CoreRecordType;
  schemaVersion: 1;
}

async function readJson(url: URL): Promise<unknown> {
  return JSON.parse(await readFile(url, 'utf8'));
}

function readEnvelope(value: unknown): GoldenEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Golden envelope must be an object.');
  }
  return value as GoldenEnvelope;
}

describe('core-v1 shared records', () => {
  it('validates and structurally round-trips every golden record', async () => {
    const names = (await readdir(casesDirectory)).filter((name) => name.endsWith('.json')).sort();
    expect(names).toHaveLength(15);

    const seen = new Set<CoreRecordType>();
    for (const name of names) {
      const envelope = readEnvelope(await readJson(new URL(`cases/${name}`, contractRoot)));
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.caseId).toBe(name.replace(/\.json$/, ''));
      const parsed = parseCoreRecord(envelope.recordType, envelope.payload);
      expect(parsed).toEqual(envelope.payload);
      expect(parsed).not.toBe(envelope.payload);
      expect(serializeCoreRecord(envelope.recordType, parsed)).toEqual(envelope.payload);
      seen.add(envelope.recordType);
    }

    const manifest = (await readJson(new URL('manifest.json', contractRoot))) as {
      enums: Record<string, string[]>;
      nullability: Record<string, string>;
      recordTypes: CoreRecordType[];
      schemaVersion: number;
      units: Record<string, string>;
    };
    expect(manifest.schemaVersion).toBe(1);
    expect([...seen].sort()).toEqual([...manifest.recordTypes].sort());
  });

  it('matches the canonical enum, unit, and nullability manifest exactly', async () => {
    const manifest = (await readJson(new URL('manifest.json', contractRoot))) as {
      enums: Record<string, string[]>;
      nullability: Record<string, string>;
      units: Record<string, string>;
    };

    expect(manifest.enums).toEqual({
      publicationSourceKind: PUBLICATION_SOURCE_KINDS,
      readingProgression: READING_PROGRESSIONS,
      publicationLayout: PUBLICATION_LAYOUTS,
      progressPrecision: PROGRESS_PRECISIONS,
      navigationUnitSource: NAVIGATION_UNIT_SOURCES,
      readerLocationReason: READER_LOCATION_REASONS,
      textDirection: TEXT_DIRECTIONS,
      decorationStyle: DECORATION_STYLE_TYPES,
      footnoteClassification: FOOTNOTE_CLASSIFICATIONS,
      readerLinkKind: READER_LINK_KINDS,
      readerLinkDisposition: READER_LINK_DISPOSITIONS,
      readerImageSourceKind: READER_IMAGE_SOURCE_KINDS,
      readerImageUnresolvedReason: READER_IMAGE_UNRESOLVED_REASONS,
      readerSelectionChangeReason: READER_SELECTION_CHANGE_REASONS,
      platform: NATIVE_PLATFORMS,
      readerErrorCode: READER_ERROR_CODES,
      readerErrorPhase: READER_ERROR_PHASES,
    });
    expect(manifest.units).toEqual(CORE_RECORD_UNITS);
    expect(manifest.nullability).toEqual(CORE_RECORD_NULLABILITY);
  });

  it('preserves unknown locator extensions and explicit JSON nulls', () => {
    const input = {
      href: 'text/chapter.xhtml',
      type: 'application/xhtml+xml',
      title: null,
      locations: {
        progression: 0.25,
        vendorRange: { start: 7, end: null },
      },
      vendorRecord: { flag: true, nullable: null },
    };
    const locator = parseLocator(input);
    input.locations.vendorRange.start = 99;

    expect(locator.locations?.vendorRange).toEqual({ start: 7, end: null });
    expect(locator.title).toBeNull();
    expect(locator.vendorRecord).toEqual({ flag: true, nullable: null });
  });

  it('rejects unit, enum, nullability, and JSON violations with a stable path', () => {
    const invalidRecords: (() => unknown)[] = [
      () =>
        parseLocator({ href: 'chapter.xhtml', type: 'text/html', locations: { progression: 1.1 } }),
      () =>
        parseReaderGeometry({
          coordinateSpace: 'native-pixels',
          viewport: { width: 390, height: 612 },
        }),
      () =>
        parseReaderLocationEvent({
          instanceId: 'reader',
          generation: 0,
          sequence: 0,
          locator: { href: 'chapter.xhtml', type: 'text/html' },
          reason: 'scroll',
          precision: 'resource',
        }),
      () =>
        parseReaderError({
          code: 'UNKNOWN',
          phase: 'open',
          message: 'No',
          recoverable: false,
        }),
      () => parseLocator({ href: 'chapter.xhtml', type: 'text/html', text: { highlight: null } }),
      () => parseLocator({ href: 'chapter.xhtml', type: 'text/html', vendor: undefined }),
    ];

    for (const parse of invalidRecords) {
      expect(parse).toThrow(RecordValidationError);
    }
    expect(invalidRecords[0]).toThrow(/\$\/locations\/progression/);
  });

  it('wraps validated reader errors without changing the wire record', () => {
    const record = parseReaderError({
      code: 'READER_NOT_READY',
      phase: 'navigate',
      message: 'The reader is still opening.',
      recoverable: true,
      nativeDetails: null,
    });
    const error = new NativeEpubKitError(record);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('READER_NOT_READY');
    expect(error.toJSON()).toEqual(record);
  });

  it('validates stable internal, external, and unsupported link events', () => {
    const sourceLocator = {
      href: 'text/reading.xhtml',
      locations: { progression: 0.25 },
      type: 'application/xhtml+xml',
    };
    expect(
      parseReaderLinkEvent({
        disposition: 'intercepted',
        generation: 3,
        href: 'https://example.com',
        instanceId: 'reader-links',
        kind: 'external',
        platform: 'android',
        scheme: 'https',
        sourceLocator,
      })
    ).toEqual({
      disposition: 'intercepted',
      generation: 3,
      href: 'https://example.com',
      instanceId: 'reader-links',
      kind: 'external',
      platform: 'android',
      scheme: 'https',
      sourceLocator,
    });
    expect(() =>
      parseReaderLinkEvent({
        disposition: 'opened',
        generation: 3,
        href: 'https://example.com',
        instanceId: 'reader-links',
        kind: 'external',
        platform: 'android',
        sourceLocator,
      })
    ).toThrow(RecordValidationError);
  });

  it('enforces coherent, rights-aware selection lifecycle records', () => {
    const restricted = parseReaderSelectionSnapshot({
      copyAllowed: false,
      direction: 'rtl',
      locator: { href: 'text/reading.xhtml', type: 'application/xhtml+xml' },
      text: '',
      truncated: false,
    });
    expect(restricted.text).toBe('');
    expect(
      parseReaderSelectionActionEvent({
        actionId: 'highlight',
        generation: 2,
        handlesActive: true,
        instanceId: 'reader-selection',
        platform: 'ios',
        selection: restricted,
        sequence: 5,
      }).selection.copyAllowed
    ).toBe(false);
    expect(() =>
      parseReaderSelectionChangeEvent({
        generation: 2,
        handlesActive: true,
        instanceId: 'reader-selection',
        platform: 'ios',
        reason: 'cleared',
        selection: restricted,
        sequence: 6,
      })
    ).toThrow(/selection/);
    expect(() =>
      parseReaderSelectionChangeEvent({
        generation: 2,
        handlesActive: false,
        instanceId: 'reader-selection',
        platform: 'ios',
        reason: 'changed',
        selection: null,
        sequence: 7,
      })
    ).toThrow(/selection/);
  });

  it('enforces coherent image handles, rights, and bounded local resolutions', () => {
    const activation = parseReaderImageActivationEvent({
      alt: 'An open book.',
      caption: 'A generated illustration.',
      generation: 2,
      instanceId: 'reader-images',
      locator: { href: 'text/gallery.xhtml', type: 'application/xhtml+xml' },
      platform: 'ios',
      rights: { canShare: false, canZoom: true },
      sequence: 4,
      source: {
        contentType: 'image/svg+xml',
        handle: 'image-source-2-1',
        href: 'images/illustration.svg',
        kind: 'publication-resource',
        resolvable: true,
      },
    });
    expect(activation.source.handle).toBe('image-source-2-1');
    expect(activation.rights).toEqual({ canShare: false, canZoom: true });

    expect(
      parseReaderResolvedImageSource({
        byteLength: 640,
        contentType: 'image/svg+xml',
        id: 'image-file-2-1',
        uri: 'file:///tmp/native-epub-kit/image-file-2-1.svg',
      })
    ).toEqual({
      byteLength: 640,
      contentType: 'image/svg+xml',
      id: 'image-file-2-1',
      uri: 'file:///tmp/native-epub-kit/image-file-2-1.svg',
    });

    expect(() =>
      parseReaderImageActivationEvent({
        ...activation,
        source: { ...activation.source, handle: undefined, resolvable: true },
      })
    ).toThrow(/handle/);
    expect(() =>
      parseReaderResolvedImageSource({
        byteLength: 640,
        contentType: 'image/svg+xml',
        id: 'image-file-2-1',
        uri: 'https://example.com/illustration.svg',
      })
    ).toThrow(/local file URI/);
  });

  it('maps native aliases and unknown phases to stable error families', () => {
    expect(
      mapNativeReaderError({
        code: 'NAVIGATOR_RUNTIME_FAILED',
        phase: 'webview',
        message: 'The navigator failed.',
        recoverable: true,
      })
    ).toEqual({
      code: 'RESOURCE_LOAD_FAILED',
      message: 'The navigator failed.',
      nativeDetails: {
        nativeCode: 'NAVIGATOR_RUNTIME_FAILED',
        nativePhase: 'webview',
      },
      phase: 'render',
      recoverable: true,
    });
    expect(
      mapNativeReaderError({
        code: 'TYPOGRAPHY_CONFIGURATION_FAILED',
        phase: 'render',
        message: 'A configured font is absent.',
        recoverable: true,
      }).code
    ).toBe('TYPOGRAPHY_CONFIGURATION_FAILED');
  });
});

describe('publication data public records', () => {
  const locator = (position: number) => ({
    href: 'text/chapter.xhtml',
    locations: { position, totalProgression: (position - 1) / 300 },
    type: 'application/xhtml+xml',
  });

  it('validates and detaches metadata, hierarchical links, and capability extensions', () => {
    const input = {
      authors: [{ name: 'Fixture Author', roles: ['aut'] }],
      capabilities: {
        customFonts: true,
        decorations: true,
        fixedLayout: false,
        footnotes: true,
        images: true,
        mappingDurationMilliseconds: 7,
        progressPrecision: 'continuous',
        search: true,
        selection: true,
        warnings: ['toc-duplicate-targets'],
      },
      generation: 4,
      identifier: 'urn:fixture:publication-data',
      instanceId: 'reader-fixture',
      languages: ['en'],
      layout: 'reflowable',
      positionCount: 300,
      readingOrder: [
        {
          children: [],
          href: 'text/chapter.xhtml',
          type: 'application/xhtml+xml',
        },
      ],
      readingProgression: 'auto',
      tableOfContents: [
        {
          children: [
            {
              children: [],
              href: 'text/chapter.xhtml#detail',
              title: 'Detail',
            },
          ],
          href: 'text/chapter.xhtml',
          title: 'Chapter',
        },
      ],
      title: 'Publication data fixture',
    };

    const parsed = parsePublicationInfo(input);
    input.tableOfContents[0]!.children[0]!.title = 'Mutated input';

    expect(parsed.tableOfContents[0]!.children[0]!.title).toBe('Detail');
    expect(parsed.capabilities.mappingDurationMilliseconds).toBe(7);
    expect(parsed.positionCount).toBe(300);
  });

  it('accepts bounded position pages and rejects broken continuation chains', () => {
    const positions = Array.from({ length: 256 }, (_, index) => locator(index + 1));
    const page = parsePublicationPositionsPage({
      generation: 4,
      instanceId: 'reader-fixture',
      nextOffset: 256,
      offset: 0,
      positions,
      total: 300,
    });
    positions[0]!.href = 'mutated.xhtml';

    expect(page.positions).toHaveLength(256);
    expect(page.positions[0]!.href).toBe('text/chapter.xhtml');
    expect(page.nextOffset).toBe(256);
    expect(() =>
      parsePublicationPositionsPage({
        generation: 4,
        instanceId: 'reader-fixture',
        nextOffset: 0,
        offset: 0,
        positions: [],
        total: 300,
      })
    ).toThrow(/must not be empty/);
    expect(() =>
      parsePublicationPositionsPage({
        generation: 4,
        instanceId: 'reader-fixture',
        nextOffset: 255,
        offset: 0,
        positions: Array.from({ length: 256 }, (_, index) => locator(index + 1)),
        total: 300,
      })
    ).toThrow(/must equal the non-final page end/);
  });
});
