# Support diagnostics and capability snapshot

LIB-026 adds one stable, publication-scoped support boundary. It is designed
for a consumer's issue-report screen, not analytics or automatic telemetry.
The SDK never transmits the snapshot; the caller decides whether to display,
copy, store, or send it.

## Public API

```ts
const diagnostics = await readerRef.current!.getDiagnostics();
const report = createReaderDiagnosticReport(diagnostics);
```

`getDiagnostics()` follows the reader command readiness matrix. It resolves
only for the exact ready generation and rejects with `READER_NOT_READY` or
`READER_DESTROYED` through the same typed command envelope as the other stable
ref methods. `createReaderDiagnosticReport()` validates the detached record a
second time and returns deterministic, pretty-printed JSON with a trailing
newline.

The schema is versioned independently from the package:

```ts
interface ReaderDiagnostics {
  schemaVersion: 1;
  sdk: { name: 'native-epub-kit'; version: string };
  platform: 'ios' | 'android';
  toolkit: {
    name: 'readium-swift' | 'readium-kotlin';
    version: string;
    revision: string;
  };
  generation: number;
  publication: {
    format: 'epub';
    layout: 'reflowable' | 'fixed';
    readingProgression: ReadingProgression;
    positionCount: number;
    progressPrecision: ProgressPrecision;
    mappingDurationMilliseconds: number;
    warnings: string[];
  };
  fonts: {
    status: 'not-configured' | 'valid' | 'invalid';
    faceCount: number;
    familyCount: number;
  };
  preferences: ReaderPreferenceDiagnostics;
  features: ReaderDiagnosticFeature[];
  warnings: string[];
  redaction: { profile: 'support-v1' };
}
```

## Capability semantics

Each feature has both a `stage` and an `enabled` flag. They answer different
questions:

- `stage` describes this package's public readiness: `stable`,
  `qualification`, `planned`, or `unsupported`.
- `enabled` describes whether the current adapter, toolkit, publication, and
  configuration can perform the underlying operation.

This avoids presenting an upstream Readium capability as a frozen public SDK
promise. Selection, decorations, images, and search are stable; custom fonts
remain a qualified native capability. Local files, publication data,
positions, navigation, restore, preferences, progress, footnotes, links, and
diagnostics are stable.
Android content URIs are stable only on Android. Remote sources are explicitly
unsupported and disabled on both platforms.

The feature list has a fixed order and exactly 16 entries. Parsers reject
missing, duplicate, unknown, incorrectly staged, or internally inconsistent
records. Core stable features must be enabled; position availability must
match `positionCount`; and active custom fonts require a reflowable
publication plus a valid installed manifest.

## Toolkit and font identity

The native values are derived from the same exact pin manifest used by the
build:

- iOS reports `readium-swift`, integration version
  `3.10.0-fontfix.845`, and the selected 40-character revision.
- Android reports `readium-kotlin`, version `3.1.2`, and its release-tag
  commit.
- Both report the npm package version from build-checked native constants.

Font diagnostics expose only manifest state and counts. `not-configured`
means no generated manifest exists; `invalid` means a manifest exists but
cannot be decoded or does not match installed valid faces; `valid` means every
declared face was accepted. Font filenames, asset paths, and family names are
not support-report fields.

## Redaction profile

`support-v1` intentionally omits:

- publication source, file/content/remote URI, and request headers;
- title, subtitle, authors, languages, identifier, TOC, and reading order;
- current locator, href, selection, selected text, or footnote content;
- native exception details, stack traces, view tags, and instance IDs;
- font filenames, paths, and family names.

Only a generation number remains for correlating the snapshot with the
consumer's in-memory reader state. Warning values are marker-only strings,
limited to 64 characters, deduplicated, sorted, and bounded to 64 items.
Publication and preference warning lists are canonicalized before the
aggregate is formed. Unknown fields never survive the public parser.

This is a data-minimization guarantee, not a promise that a consuming app
cannot add sensitive material around the report. Applications should show the
exact report to the user before sharing it and should not append book names,
paths, reading locations, or account data without a separate consent decision.

## Cross-platform verification

`diagnostics-v1` contains iOS reflowable, Android fixed-layout, and Android
invalid-font cases. The same fixtures execute in TypeScript, the production
Swift policy, and the production Kotlin policy. Tests assert exact stages,
enabled features, toolkit identity, warning order, bounds, and all forbidden
keys/fragments. TypeScript additionally rejects unknown fields and
inconsistent feature/font/warning records.

The example's **Issue report** action calls only the stable ref. It presents a
human-readable platform/toolkit/layout/font/feature summary and selectable
deterministic JSON. The device flow repeats the check for reflowable and fixed
EPUBs on iOS and Android, including active custom-font capability changing to
off for fixed layout while the valid manifest status remains visible.
