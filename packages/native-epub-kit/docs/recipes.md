# Recipes

These recipes compose the headless SDK into product behavior without assuming a
particular catalog, database, theme, or brand. Start with the
[five-minute installation](getting-started.md), then add only the capabilities
your product needs. All durable positions below are complete Readium Locators.

## Open a downloaded file

Download and authenticate with application-owned networking, close any active
reader for the same path, verify that the file is a readable EPUB, and pass its
local `file:` URI:

```tsx
<EpubReaderView
  ref={readerRef}
  source={{ kind: 'file', uri: localEpubUri }}
  onReady={() => setReaderState('ready')}
  onError={({ error }) => showReaderRecovery(error.code, error.recoverable)}
/>
```

Set `source={null}` and wait for the lifecycle to return to `idle` before
replacing or deleting the file. A remote source is deliberately rejected; the
SDK never owns credentials, retries, caching, or download policy.

## Open an Android document-provider URI

An existing persistable read grant may be opened without converting it to a
filesystem path:

```tsx
const source =
  Platform.OS === 'android'
    ? { kind: 'content' as const, uri: grantedContentUri }
    : { kind: 'file' as const, uri: copiedSecurityScopedFileUri };
```

The application obtains and retains the grant. `content:` is unsupported on
iOS; copy or resolve a document-provider selection to a readable local file and
hold its security scope for the reader lifetime.

## Restore exact position and show progress

Persist the last stable `event.locator`, not a percentage or chapter index, and
pass it as `initialLocator` during the next source generation:

```tsx
<EpubReaderView
  source={source}
  initialLocator={savedState?.currentLocator}
  chapterGranularity="top-level"
  onLocationChange={(event) => {
    persistEventually(event.locator);
    setDisplayProgress({
      chapter: event.chapterProgress,
      overall: event.overallProgress,
      precision: event.precision,
    });
  }}
/>
```

Keep current and furthest progress separate. Flush the current Locator when the
app backgrounds, the reader closes, or the user explicitly changes chapters.
Treat `precision` as authoritative; do not promise continuous accuracy when a
platform reports `position` or `resource`.

For ordered, rollback-safe writes, use the persistence controller:

```ts
const controller = createReaderPersistenceController({
  adapter,
  publicationId,
  progressWriteIntervalMs: 750,
});

const restored = await controller.restore();
controller.recordProgress(locationEvent);
await controller.handleAppStateChange('background');
await controller.flush('reader-close');
await controller.destroy();
```

## Build a chapter browser

Configure one granularity and use the same native-derived units for contents,
progress, gestures, and continuation:

```ts
const units = await readerRef.current?.getNavigationUnits('top-level');
const context = await readerRef.current?.getNavigationUnitContext();

await readerRef.current?.goToNavigationUnit(selectedUnit.id, { history: 'push' });
```

Render nested publisher contents separately when desired, but use unit IDs and
Locators returned by the SDK rather than deriving boundaries from titles or
array indexes. Duplicate/fragment links and reading-order fallback units are
normalized by the native snapshot.

## Require explicit chapter continuation

Chapter-turn gestures default to disabled:

```tsx
<EpubReaderView
  chapterGranularity="top-level"
  navigationPolicy={{
    chapterTurnGesture: 'disabled',
    pageTurnGesture: 'enabled',
    edgeTapNavigation: false,
  }}
  onNavigationUnitBoundary={(event) => setPendingBoundary(event)}
/>
```

At an exact end boundary, show app-owned Previous/Next or Finish controls and
call `goToNextNavigationUnit()` only after a deliberate action. If your product
uses a fixed physical convention, keep Previous on the left and Next on the
right in both LTR and RTL; content progression and chrome placement are
different decisions. Enabling `chapterTurnGesture` later applies the native
guard status reported by `onNavigationPolicyChange`.

## Install and target reader fonts

Declare every face at Expo prebuild time, sharing one family across its weights:

```json
{
  "expo": {
    "plugins": [
      [
        "native-epub-kit",
        {
          "fonts": [
            {
              "family": "Reader Serif",
              "source": "./assets/fonts/ReaderSerif-Regular.ttf",
              "weight": 400,
              "style": "normal"
            },
            {
              "family": "Reader Serif",
              "source": "./assets/fonts/ReaderSerif-Bold.ttf",
              "weight": 700,
              "style": "normal"
            }
          ]
        }
      ]
    ]
  }
}
```

Then reference only installed or generic families in a closed typography
profile:

```ts
const typographyProfile: TypographyProfile = {
  publisherStyles: 'hybrid',
  defaultFontFamilies: ['Reader Serif', 'serif'],
  rules: [
    {
      target: { kind: 'language', value: 'ur' },
      fontFamilies: ['Reader Urdu', 'serif'],
      lineHeight: 1.65,
    },
    {
      target: { kind: 'direction', value: 'rtl' },
      textAlign: 'start',
    },
    {
      target: { kind: 'class', value: 'quranic' },
      fontFamilies: ['Reader Quran', 'serif'],
    },
  ],
};
```

Use `preserve` for publisher styling, `hybrid` for constrained repairs, or
`override` for a product-owned default family. Arbitrary CSS/selectors/scripts
are intentionally unavailable. Check `getDiagnostics().fonts.status` after
prebuild; `invalid` is a release blocker.

## Present footnotes without losing position

Enable semantic notes first and add heuristics only for a measured catalog:

```tsx
<EpubReaderView
  footnotePolicy={{ mode: 'semantic-and-heuristic' }}
  linkPolicy={{
    allowedExternalSchemes: ['https'],
    externalLinks: 'intercept',
    unsupportedSchemes: 'block',
  }}
  onFootnotePress={(event) => presentSanitizedFootnote(event)}
  onLinkPress={(event) => confirmOrExplainLink(event)}
/>
```

The note is intercepted before default navigation. Render bounded text or
strictly sanitized bounded HTML in app-owned, focus-isolated UI. The event's
source and target Locators support “Open in chapter” plus exact Back. Never load
the untrusted HTML in a privileged WebView, and never open an external URL
without consumer confirmation.

## Highlight and annotate a selection

Expose up to eight localized native actions:

```tsx
<EpubReaderView
  selectionActions={[
    { id: 'highlight', title: 'Highlight' },
    { id: 'note', title: 'Add note' },
    { id: 'share', title: 'Share' },
  ]}
  onSelectionAction={(event) => openAnnotationEditor(event.selection, event.actionId)}
/>
```

Persist the immutable selection Locator/text according to publication rights,
then draw the committed record in a dedicated group:

```ts
await readerRef.current?.updateDecorations('annotations:v1', [
  { type: 'add', decoration: annotationDecoration },
]);
await readerRef.current?.clearSelection();
```

Decoration groups are isolated replacement domains. A native decoration is a
view projection, not your database. If drawing fails after persistence, retain
the durable annotation and retry a complete group synchronization.

## Add and restore bookmarks

Capture the current canonical location, persist it with a stable app-owned ID,
and render a margin decoration:

```ts
const locator = await readerRef.current?.getCurrentLocation();
if (locator) await controller.saveBookmark(bookmarkFromLocator(locator));
await readerRef.current?.setDecorations('bookmarks:v1', bookmarkDecorations);
```

Navigate back with `goTo(bookmark.locator, { history: 'push' })`. Store a short
optional excerpt and chapter title only for display; neither replaces the
Locator.

## Search a publication

Start a bounded native session and consume each cursor at most once:

```ts
const first = await readerRef.current?.search(query, { pageSize: 50 });
if (!first) return;

let page = first;
while (page.nextCursor) {
  const next = await readerRef.current?.getSearchPage(first.id, page.nextCursor);
  if (!next) break;
  page = next;
}

await readerRef.current?.cancelSearch(first.id);
```

A new search cancels its predecessor; source replacement and unmount also
release it. Show `truncated` honestly at the 2,000-result bound. Search result
Locators can be sent directly to `goTo()`. Use the session-provided result and
current decoration group names so search never overwrites annotations.

## Zoom or share a publication image

The activation event exposes rights and an opaque source, never permanent raw
file access:

```ts
if (!event.rights.canZoom || !event.source.resolvable) return;
const resolved = await readerRef.current?.resolveImageSource(event.source, 'zoom');
if (!resolved) return;
try {
  await presentImage(resolved.uri, event.alt, event.caption);
} finally {
  await readerRef.current?.releaseImageSource(resolved.id);
}
```

Set `imagePolicy.allowSharing` only after evaluating rights. Sharing UI,
attribution, quote-card rendering, and the system share sheet remain app-owned.
Do not fetch an external image URL from publication content.

## Map errors to recovery

Use stable code/phase/recoverable fields rather than parsing messages:

```ts
function handleReaderError(error: ReaderError) {
  switch (error.code) {
    case 'source-unavailable':
    case 'publication-open-failed':
      return offerRedownloadOrRetry();
    case 'unsupported-source':
      return explainUnsupportedPublication();
    default:
      return error.recoverable ? offerRetry() : closeReaderSafely();
  }
}
```

Keep a bounded local app log if desired. `getDiagnostics()` and
`createReaderDiagnosticReport()` are redaction-safe SDK snapshots, but the SDK
never transmits telemetry. Do not add source URIs, Locators, selected text, book
content, credentials, or font paths to support payloads.

## Build an accessible product shell

- Give the reader and every app-owned action a localized accessibility label.
- Focus-isolate footnote, settings, search, annotation, and image modals; return
  focus to the invoking control on dismissal.
- Keep visible Previous/Next controls even when gestures are enabled.
- Respect reduced motion and platform text scaling in app chrome without
  injecting those choices into publisher content.
- Announce meaningful chapter/progress changes once; do not duplicate the
  WebView's semantic reading.
- Verify LTR, RTL, mixed bidi, phone/tablet, portrait/landscape, screen-reader,
  maximum text-size, process-death, and background/foreground journeys.

## Next steps

Use the [API reference](api-reference.md) for every exported symbol,
[troubleshooting](troubleshooting.md) for failure diagnosis, and
[limitations and upgrades](limitations-and-upgrades.md) before changing native
dependencies.
