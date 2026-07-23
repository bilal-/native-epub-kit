# native-epub-kit

An unofficial, headless native EPUB SDK for Expo and React Native applications.
The package is an unpublished community release candidate on the 0.x line. Its
API is not yet frozen for 1.0, but its exact Expo path, package contents,
documentation, native behavior, and clean-consumer integration are qualified.

Native EPUB Kit is an independent community project. It is not affiliated with,
sponsored by, or endorsed by Expo, 650 Industries, the Readium Foundation, or
EDRLab.

## Install and documentation

Native EPUB Kit contains native Swift and Kotlin code, so it requires an Expo
development build or release build; it does not run in Expo Go.

```sh
npm install native-epub-kit@0.1.0
```

Add `native-epub-kit` to the Expo `plugins` array, then run
`npx expo prebuild --clean` and build the native application. The complete
supported path is bundled with the package:

- [Install and open a local EPUB](docs/getting-started.md)
- [Core view, events, commands, and errors](docs/core-api.md)
- [Generated API reference](docs/api-reference.md)
- [Product integration patterns](docs/product-integration.md)
- [Task-oriented recipes](docs/recipes.md)
- [Troubleshooting](docs/troubleshooting.md)
- [0.x alpha migration](docs/alpha-migration.md)
- [Known limitations and native upgrades](docs/limitations-and-upgrades.md)

## Complete example

Add the package's config plugin so Expo CNG can install the exact iOS Readium
revision and Android desugaring configuration:

```json
{
  "expo": {
    "plugins": [
      [
        "native-epub-kit",
        {
          "fonts": [
            {
              "family": "My Reader Font",
              "source": "./assets/fonts/MyReaderFont.ttf",
              "weight": 400,
              "style": "normal"
            }
          ]
        }
      ]
    ]
  }
}
```

The lifecycle-level native view accepts the stable source record and emits
plain, ordered callback payloads:

<!-- doctest: examples/CompleteReader.tsx -->

```tsx
import {
  EpubReaderView,
  createReaderDiagnosticReport,
  type EpubReaderViewRef,
  type ReaderNavigationPolicy,
  type ReaderPreferences,
  type ReaderSelectionAction,
  type TypographyProfile,
} from 'native-epub-kit';
import { useRef, useState } from 'react';

const typographyProfile: TypographyProfile = {
  publisherStyles: 'hybrid',
  colors: {
    background: '#F5F0E8',
    link: '#005A8D',
    text: '#3D2B1F',
  },
  defaultFontFamilies: ['My Reader Font', 'serif'],
  rules: [
    {
      target: { kind: 'language', value: 'ur' },
      fontFamilies: ['My Reader Font', 'serif'],
      lineHeight: 1.65,
    },
    {
      target: { kind: 'language', value: 'ar' },
      fontFamilies: ['My Reader Font', 'serif'],
      lineHeight: 1.65,
    },
    {
      target: { kind: 'class', value: 'quranic' },
      color: '#1A5F4A',
    },
  ],
};

const selectionActions: ReaderSelectionAction[] = [
  { id: 'highlight', title: 'Highlight' },
  { id: 'note', title: 'Add note' },
  { id: 'share', title: 'Share quote' },
];

export function Reader({ localEpubUri }: { localEpubUri: string }) {
  const readerRef = useRef<EpubReaderViewRef>(null);
  const [navigationPolicy] = useState<ReaderNavigationPolicy>({
    chapterTurnGesture: 'disabled',
    edgeTapNavigation: false,
  });
  const [preferences] = useState<ReaderPreferences>({
    layout: 'scrolled',
    theme: 'sepia',
  });

  return (
    <EpubReaderView
      ref={readerRef}
      source={{ kind: 'file', uri: localEpubUri }}
      chapterGranularity="top-level"
      navigationPolicy={navigationPolicy}
      preferences={preferences}
      typographyProfile={typographyProfile}
      footnotePolicy={{ mode: 'semantic-and-heuristic' }}
      linkPolicy={{
        allowedExternalSchemes: ['https'],
        externalLinks: 'intercept',
        unsupportedSchemes: 'block',
      }}
      imagePolicy={{ allowZoom: true, allowSharing: false }}
      classifyFootnote={(event) =>
        event.id === 'publisher-navigation-target' ? 'navigate' : 'footnote'
      }
      selectionActions={selectionActions}
      onFootnotePress={(event) => console.log(event.text, event.sourceLocator)}
      onLinkPress={(event) => console.log(event.kind, event.disposition, event.href)}
      onImagePress={async (event) => {
        if (!event.source.resolvable || !event.rights.canZoom) return;
        const resolved = await readerRef.current?.resolveImageSource(event.source, 'zoom');
        if (!resolved) return;
        try {
          console.log(resolved.uri, event.alt, event.caption);
        } finally {
          await readerRef.current?.releaseImageSource(resolved.id);
        }
      }}
      onSelectionAction={(event) =>
        console.log(event.actionId, event.selection.copyAllowed, event.selection.geometry)
      }
      onSelectionChange={(event) => console.log(event.reason, event.handlesActive)}
      onDecorationPress={(event) =>
        console.log(event.group, event.decoration.id, event.decoration.data, event.geometry)
      }
      onNavigationPolicyChange={(status) => {
        console.log(status.applied, status.effectiveLayout, status.application);
      }}
      onPreferencesChange={(status) => {
        console.log(status.requested, status.applied, status.support);
      }}
      onStateChange={(event) => console.log(event.state, event.generation, event.sequence)}
      onReady={async () => {
        const publication = await readerRef.current?.getPublication();
        const firstPositions = await readerRef.current?.getPositions({ limit: 256 });
        const preferenceStatus = await readerRef.current?.getPreferences();
        const navigationPolicyStatus = await readerRef.current?.getNavigationPolicy();
        const navigationUnits = await readerRef.current?.getNavigationUnits('top-level');
        const diagnostics = await readerRef.current?.getDiagnostics();
        console.log(
          publication?.title,
          publication?.tableOfContents,
          firstPositions,
          preferenceStatus,
          navigationPolicyStatus,
          navigationUnits
        );
        if (diagnostics) console.log(createReaderDiagnosticReport(diagnostics));

        const search = await readerRef.current?.search('faith', { pageSize: 50 });
        if (search) {
          const firstSearchPage = await readerRef.current?.getSearchPage(
            search.id,
            search.nextCursor
          );
          console.log(firstSearchPage?.results, firstSearchPage?.truncated);
          await readerRef.current?.cancelSearch(search.id);
        }
      }}
      onError={({ error }) => console.error(error.code, error.message)}
      onLocationChange={(event) =>
        console.log(
          event.locator,
          event.navigationUnit?.title,
          event.chapterProgress,
          event.overallProgress,
          event.precision
        )
      }
      style={{ flex: 1 }}
    />
  );
}
```

Font declarations are a closed, build-time native contract. Multiple distinct
weight/style faces may share a family. Sources must be readable project-relative
TrueType/OpenType files inside the Expo root; malformed, missing, escaping, or
duplicate face declarations fail before native assets are mutated. Repeated
prebuild reconciles stale Android/iOS assets, Xcode resources, and reserved
`UIAppFonts` entries without duplicates. See the
[production font config-plugin record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/font-config-plugin.md).

At runtime, both native adapters validate that generated manifest atomically,
reject unknown or missing native entries, and group all weight/style faces into
one exact Readium declaration per family. `getDiagnostics()` reports only
redaction-safe `not-configured | valid | invalid` status and admitted
face/family counts. See the
[native font-registry record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/native-font-registry.md).

`typographyProfile` is a stable, reflowable-content contract. It selects only
installed or generic families through language, direction, or one safe EPUB
class token and can emit only exact surface colors, family, direction,
line-height, and weight declarations. Colors use closed `#RRGGBB` values:
`background`, `text`, and `link` form one all-or-nothing surface palette, while
a rule may set one exact text color. `preserve` trusts publisher content,
`hybrid` applies targeted repairs while retaining publisher styles, and
`override` applies the default family throughout reflowable content with
publisher styles disabled. The profile contains no reading-progression field,
raw selector, stylesheet, script, URL, or HTML. Native validation rejects the
complete profile if a family is unavailable or a color is malformed. Profile
changes recreate the navigator while restoring the canonical locator. See the
[stable typography-profile record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/typography.md).

`footnotePolicy` defaults to semantic Readium/EPUB notes and can opt into a
conservative heuristic plus up to 16 closed declarative publisher rules. A
native note decision prevents default navigation before bounded content is
resolved. `classifyFootnote` can safely downgrade an already-prevented
candidate to ordinary navigation. `linkPolicy` classifies external and
unsupported schemes as intercepted or blocked; native code never opens another
application. Events retain canonical source/target locators and native
generation identity. Bridged HTML is untrusted and must be sanitized by the
consumer UI. See the
[production footnote/link record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/footnotes-links.md).

`selectionActions` adds up to eight localized custom items to the native text
selection menu while preserving rights-aware system Copy. Action and lifecycle
events carry the same canonical, grapheme-bounded snapshot returned by
`getCurrentSelection()`, with logical bidi text, explicit copy/truncation state,
generation identity, and optional clipped reader/window geometry. Custom
actions retain platform-owned handles; call `clearSelection()` after the
consumer flow finishes. See the
[production selection record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/selection.md).

`setDecorations(group, decorations)` replaces one isolated group and
`updateDecorations(group, changes)` applies an atomic ordered add/update/remove
delta. Built-in highlights, underlines, bookmark/note margin icons, and one
bounded rounded-box template are supported; arbitrary HTML, CSS, scripts,
URLs, and assets are not. `onDecorationPress` returns the canonical normalized
record, consumer JSON data, group identity, monotonic generation identity, and
optional reader/window geometry. See the
[decoration record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/decorations.md).

`search(query, options)` creates one generation-scoped native Readium search
session and cancels any predecessor. `getSearchPage(sessionId, cursor)`
consumes one forward-only cursor exactly once; pages are capped at 100 results
and sessions at 2,000 with explicit truncation. Results carry canonical
locators, bounded logical bidi excerpts, optional resource titles and chapter
context, plus independent `search.results:v1` and `search.current:v1`
decoration group names. Close, source replacement, unmount, and explicit
idempotent cancellation release the iterator. See the
[native search-session record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/search.md).

`onImagePress` returns a canonical locator, bounded alt/caption metadata,
optional normalized geometry, an immutable rights snapshot, and an opaque
generation-scoped source descriptor. `resolveImageSource()` materializes an
allowed zoom/share source as a bounded local file; consumers must release it
after their app-owned UI finishes. Sharing defaults off, external images are
never fetched, and Android fixed-layout support is reported unavailable under
the pinned Kotlin toolkit. See the
[image activation record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/images.md).

`createReaderPersistenceController()` composes canonical stored progress,
bookmarks, annotations, and scoped preferences over a consumer-supplied
`ReaderPersistenceAdapter`. Restore is atomic; writes are serialized per
controller; progress uses a trailing throttle with explicit lifecycle flushes;
and optimistic bookmark/annotation/preference mutations commit on adapter
success or roll back only the failed operation. The package includes
`InMemoryReaderPersistenceAdapter` for tests and intentionally ephemeral
readers, but never selects storage implicitly. See the
[persistence/controller record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/persistence.md).

The view hosts a real `EPUBNavigatorViewController` on iOS and
`EpubNavigatorFragment` on Android. `getCurrentLocation()`,
`getCurrentSelection()`, `clearSelection()`, `getPublication()`, bounded
`getPositions()`, redaction-safe `getDiagnostics()`, and canonical navigation
commands are available on its ref.
Metadata retains the hierarchical TOC and fragment links, reading order,
layout, capability report, and source generation identity. Position pages
default to 128 locators and never exceed 256, so a large toolkit position list
is not sent through a prop or event. See the
[publication-data record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/publication-data.md).

`goTo()` accepts a canonical locator or a link returned by `getPublication()`;
`goToProgression()` and `goToPosition()` expose publication-wide targets.
`goForward()` and `goBackward()` resolve `false` at a logical boundary and
`true` after observable movement. Pass a saved locator as `initialLocator` for
an atomic open-time restore. See the
[navigation and restore record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/navigation-and-restore.md)
for validation, errors, Android's vertical-scroll fallback, and persistence
ownership.

With `chapterGranularity` configured, the native gesture guard installs the
same derived unit intervals used by progress. `getNavigationUnitContext()`,
direct/next/previous unit commands, exact rejected-crossing callbacks, and a
generation-scoped 64-entry jump/back history are available on the stable view.
TOC/link/direct jumps push by default; sequential movement ignores history by
default, and every command can override this with `history: 'push' | 'ignore'`.
Successfully followed native internal hyperlinks push their exact source
Locator as well; intercepted or blocked links do not mutate history.
The context's `atLastPosition` flag is a non-completion affordance hint: it
reports that position precision has reached the unit's final known discrete
position, which may still contain scrollable content. `atEnd` remains the exact
progress boundary. Successful explicit jumps also settle the public current
location on the resolved destination; the iOS host guards against Readium's
transient source-resource `currentLocation` after an animated resource jump.
See the [navigation-unit boundaries/history record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/navigation-boundaries-history.md).

`getNavigationUnits()` derives generation-coherent chapter/progress intervals
from the complete native publication and every bounded position page. Choose
`top-level`, `leaf`, or `{ depth: number }`; the result retains duplicate labels
as aliases, inserts reading-order fallbacks for uncovered content, and exposes
bounded diagnostics without rewriting the publisher TOC. The same pure
`deriveNavigationUnits()` helper is available to Node tooling. See the
[navigation-unit record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/navigation-units.md).

Set `chapterGranularity` to opt stable location callbacks and
`getCurrentLocation()` into that same unit policy. Enriched events report the
current unit, chapter and overall progress, available position counts, and the
least precise `continuous | position | resource` marker actually used. The
shared calculation uses the visible-start locator, start-inclusive/end-exclusive
unit intervals, and raw-event fallback if a coherent snapshot cannot be loaded.
Headless helpers also keep current and monotonic furthest controller progress
separate. See the [reader-progress record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/reader-progress.md).

`preferences` accepts validated theme, font-size, scrolled/paginated layout,
fixed-layout spread, margins, line-height, alignment, publisher-style, and
reading-progression values. `onPreferencesChange` and `getPreferences()`
report requested versus actually applied fields plus an explicit support
reason for every disabled control. Live changes preserve and re-emit the
current canonical locator with reason `preference-change`. See the
[reader-preferences record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/reader-preferences.md).

`navigationPolicy` independently controls user page gestures, cross-resource
chapter gestures, edge taps, hardware keys, directional transition animation,
and temporary directional-input suppression. Page gestures are enabled while
chapter gestures and edge taps are disabled by default. Horizontal input maps
through the effective LTR/RTL reading progression. Five fields update live;
changing the immutable chapter-turn policy recreates the navigator while
preserving its canonical locator. `onNavigationPolicyChange` and
`getNavigationPolicy()` report the normalized policy, native effective layout,
boundary precision, and application mode. Explicit ref navigation remains
available when user gestures are disabled. See the
[runtime navigation-policy record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/navigation-policy.md).

`getDiagnostics()` returns exact SDK/toolkit versions, platform, EPUB
layout/progress precision, manifest counts, preference support, bounded warning
markers, and staged feature availability. It intentionally excludes source
URIs, headers, publication identity/content, locators, selections, native
details, stacks, and font paths/names. The SDK does not transmit reports. See
the [support-diagnostics record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/support-diagnostics.md).

A command invoked before `ready` rejects with a recoverable
`NativeEpubKitError`/`READER_NOT_READY`; a retained ref after native view
destruction rejects with `READER_DESTROYED`. Commands are not silently queued
across source generations.

Lifecycle and location event identities contain a native view instance ID,
source generation, and per-generation monotonic sequence. `onStateChange`
precedes the matching `onReady`; `onError` precedes the matching error state.
User-scroll location events are limited to one per 120 ms while initial and
programmatic locations remain immediate. See the
[stable native view API](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/stable-native-view-api.md).

One concurrent Android reader per `FragmentActivity` is presently qualified.

The production session validates readable local `file:` EPUBs on both
platforms and probes real Android `content:` URIs through `ContentResolver`.
The caller owns the Android read grant. On iOS, a successfully acquired
security-scoped file lease is held until the publication closes. Missing,
unreadable, unsupported, and corrupt sources emit typed state errors; remote
sources are recoverably rejected before networking. Passing `source={null}` closes
the navigator and session and returns the mounted view to `idle`.

Every open is a one-shot native session with explicit transient asset,
publication, and source-lease ownership. Cancellation generations suppress
stale completion, and closing is idempotent across replacement, unmount,
failure, and deinitialization. See the
[production publication-session record](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/production-publication-session.md).

The current compatibility target is Expo SDK 56, React Native 0.85.3, iOS
16.4+, and Android 7+. The package pins Readium Swift to a signed upstream
post-3.10.0 revision containing the font fix and Readium Kotlin to 3.1.2, the
newest release compatible with Expo 56's Kotlin metadata level. The package as
a whole is still pre-release; the lifecycle, publication-data,
navigation/restore, reader-preference, support-diagnostics, navigation-unit,
reader-progress, runtime navigation-policy, boundaries/history, production
font delivery, native multi-face registry, footnote/link, selection,
decoration, and native-search slices are implemented for the 0.x track,
including the stable constrained typography profile.

## Stable record boundary

The stable cross-platform record contract is available to the component and
headless tooling:

```ts
import {
  NativeEpubKitError,
  parseLocator,
  parsePublicationInfo,
  parsePublicationPositionsPage,
  parseReaderError,
  parseReaderLinkEvent,
  parseReaderDecorationActivationEvent,
  parseReaderSelectionActionEvent,
  parseReaderSelectionChangeEvent,
  parseReaderSelectionSnapshot,
  type Locator,
  type PublicationInfo,
  type PublicationPositionsPage,
  type ReaderLocationEvent,
  type ReaderLinkEvent,
  type ReaderDecoration,
  type ReaderDecorationActivationEvent,
  type ReaderDecorationChange,
  type ReaderSelectionActionEvent,
  type ReaderSelectionChangeEvent,
  type ReaderSelectionSnapshot,
} from 'native-epub-kit';
```

`parseLocator` validates known Readium fields while retaining unknown JSON
extensions and explicit extension nulls. Geometry uses logical points on iOS
and density-independent pixels on Android under the
`reader-view-and-window-v1` marker. Progress events carry a reason and an
explicit `continuous | position | resource` precision. Stable error codes and
phases are mapped consistently across native platforms and can be wrapped by
`NativeEpubKitError` for rejected async commands.

`parsePublicationInfo` and `parsePublicationPositionsPage` enforce the same
detached metadata and bounded continuation contracts used by the component.

See the [shared record contract](https://github.com/bilal-/native-epub-kit/blob/main/docs/architecture/shared-records.md).
The source/lifecycle/location/ref slice is stable for the 0.x implementation
track. Preferences, navigation policy, constrained typography profiles,
footnote/link events, selection actions/lifecycle, and decoration groups are
top-level. Only raw progress and explicit next-resource probes remain isolated
under `unstable_qualification` until their production tasks land.
