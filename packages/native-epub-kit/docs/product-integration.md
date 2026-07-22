# Product integration patterns

Native EPUB Kit is intentionally headless. The application owns presentation,
durable storage, sharing, external navigation, accessibility announcements,
and rights policy. These patterns describe the qualified composition.

## Chapters, progress, and continuation

Set `chapterGranularity="top-level"` (or `leaf` / `{ depth }`) and consume
`onLocationChange`. Its `navigationUnit`, `chapterProgress`, `overallProgress`,
and `precision` fields all come from the same immutable publication snapshot.
Use `getNavigationUnits()` for a contents UI and
`getNavigationUnitContext()` for Previous/Next availability.

Keep `chapterTurnGesture: 'disabled'` by default. A disabled swipe or key that
would cross the exact unit emits `onNavigationUnitBoundary`; show an app-owned
continuation surface and call `goToNextNavigationUnit()` only after an explicit
action. Always provide visible Previous and Next controls even when chapter
gestures are enabled.

Persist current and furthest progress separately. Mark completion only from a
deliberate boundary/continuation action or a product-defined final-position
rule, not from a rounded percentage.

## Typography, scripts, and direction

Declare every non-generic family through the config plugin, then reference the
exact family in `typographyProfile`. Use language, direction, or a single EPUB
class token for targeted rules. `preserve` keeps publisher styles, `hybrid`
adds targeted repairs, and `override` applies the default family while disabling
publisher styles.

Typography direction styles content; it does not redefine publication reading
progression. Keep app chrome layout independent of content direction when the
product uses fixed physical conventions, such as Previous on the left and Next
on the right.

## Footnotes and links

Native code intercepts a note before default navigation and emits bounded text,
untrusted bounded HTML, canonical source/target Locators, classification, and
generation identity. Render content through a strict sanitizer or a constrained
text model. Never inject the HTML into a privileged WebView.

An intercepted external URL still requires application confirmation before
calling the platform. Keep the scheme allowlist closed. Blocked and cancelled
links do not change position or history. Internal non-note links may navigate
and add a Back-to-previous-location affordance through `goBack()`.

## Selection, annotations, and bookmarks

Configure native actions such as Highlight, Note, and Share. On
`onSelectionAction`, present app-owned UI using the immutable selection and
optional reader/window geometry. Native handles remain active until the app
calls `clearSelection()` or the platform dismisses them.

Persist annotations/bookmarks before updating native decorations. Use one
stable decoration group per concern and an atomic delta for a committed change.
If native drawing fails after persistence succeeds, retain the durable record
and retry a full group synchronization. Never treat decoration state as the
database.

## Search

Debounce and present queries in the app. Start one native session, page with its
single-use cursor, cancel it when the query/source/UI is replaced, and use the
session's dedicated result/current decoration groups. Search result Locators
are ordinary canonical Locators; navigate with `goTo()` and provide an explicit
Return action using history or an app-captured starting Locator.

## Publication images and sharing

The activation event contains metadata and rights, not raw file access. Resolve
an opaque source only for an allowed use, pass the resulting local URI to the
app-owned zoom/share UI, and release it in `finally`. Do not fetch external
publication images. Text/card rendering and system sharing are outside the SDK.

## Persistence adapter

Implement `ReaderPersistenceAdapter` in application storage and create one
controller per publication:

```ts
import { createReaderPersistenceController } from 'native-epub-kit';

const controller = createReaderPersistenceController({
  adapter,
  publicationId,
  progressWriteIntervalMs: 750,
});

await controller.restore();
const unsubscribe = controller.subscribe(setReaderState);

// Feed only stable progress locations.
controller.recordProgress(locationEvent);

// Flush at semantic lifecycle boundaries.
await controller.flush('reader-close');
await controller.destroy();
unsubscribe();
```

The controller serializes mutations, applies a trailing progress throttle, and
rolls back only a failed optimistic bookmark/annotation/preference operation.
The app chooses SQLite, another durable store, or the included intentionally
ephemeral in-memory adapter.

## Lifecycle checklist

- Wait for `onReady` before using the ref.
- Reject stale async work by `instanceId` and `generation`.
- Flush progress on background, explicit continuation, close, and teardown.
- Cancel search and release resolved images when their UI closes.
- Set `source={null}` and wait for idle before deleting/replacing its file.
- Store the last stable Locator, never a transient percentage substitute.
- Re-read capabilities after each new source generation.
- Keep diagnostics local unless the user explicitly shares them.

## Accessible product shell

Give the reader a localized accessibility label. Keep all app-owned modals
focus-isolated and return focus to a meaningful control. Respect reduced motion,
minimum target sizes, and app font scaling without forcing those decisions into
publication content. Announce chapter/progress changes once; do not duplicate
the WebView's semantic reading.

See [known limitations and native upgrades](limitations-and-upgrades.md) before
changing dependencies or the supported device floor.
