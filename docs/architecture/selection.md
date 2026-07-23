# Production selection actions and geometry

LIB-060 promotes native text selection from a qualification probe to a stable
0.x API. Readium and the platform WebView continue to own selection, handles,
the system Copy command, and accessibility behavior. Native EPUB Kit adds
validated custom menu items and emits canonical, rights-aware snapshots; it
does not synthesize DOM ranges, inject selection scripts, or draw replacement
handles.

## Public API

Custom actions are localized by the consuming application:

```tsx
const readerRef = useRef<EpubReaderViewRef>(null);

<EpubReaderView
  ref={readerRef}
  selectionActions={[
    { id: 'highlight', title: 'Highlight' },
    { id: 'note', title: 'Add note' },
    { id: 'share', title: 'Share quote' },
  ]}
  onSelectionChange={(event) => setActiveSelection(event.selection)}
  onSelectionAction={(event) => openActionSheet(event.actionId, event.selection)}
/>;
```

The stable ref exposes:

```ts
getCurrentSelection(): Promise<ReaderSelectionSnapshot | null>;
clearSelection(): Promise<void>;
```

`getCurrentSelection()` returns the latest canonical snapshot for the current
ready generation, not a second independently shaped payload. It returns
`null` when no native selection is active. `clearSelection()` is idempotent,
emits a terminal `cleared` lifecycle event for an active selection, and asks
Readium to dismiss the native selection.

Action configuration is part of the atomic open envelope. Changing it while a
publication is ready recreates the navigator and restores the current
canonical locator. A configuration may contain at most eight actions. Each ID
must be unique and match `[A-Za-z][A-Za-z0-9._:-]{0,63}`. Titles are normalized
to NFC, trimmed, limited to 64 UTF-16 units, and may not contain control
characters. Unknown fields fail validation in TypeScript and both native
adapters.

System Copy is not a custom action and consumers do not configure it. It
remains available whenever the publication's copy rights permit it. Readium
Kotlin 3.1.2 replaces the WebView's default action callback when a custom
callback is installed, so the Android adapter deliberately restores a native
Copy item and delegates the copy decision to Readium publication rights.

## Stable records

An active `ReaderSelectionSnapshot` contains:

- the canonical Readium range `locator`;
- bounded logical-order `text`;
- required `copyAllowed` and `truncated` booleans;
- first-strong `ltr | rtl | auto` direction when available;
- an exact navigation-unit ID when the current location has one;
- optional normalized aggregate geometry; and
- optional language only when a native selected-node source can provide it
  exactly.

The current Readium selection APIs do not expose the selected DOM node's
language. Both adapters therefore omit `language`; they never substitute the
publication's metadata language. This prevents a mixed Arabic, Urdu, and
English book from reporting plausible but incorrect selection metadata.

`ReaderSelectionChangeEvent` adds platform, native view `instanceId`, source
`generation`, monotonic generation-scoped `sequence`, `handlesActive`, and one
of four reasons:

| Reason      | Selection | Handles | Meaning                                     |
| ----------- | --------- | ------- | ------------------------------------------- |
| `started`   | snapshot  | active  | First accepted native selection             |
| `changed`   | snapshot  | active  | Logical range or aggregate frame changed    |
| `cleared`   | `null`    | false   | Consumer called `clearSelection()`          |
| `dismissed` | `null`    | false   | Platform selection UI ended without command |

`ReaderSelectionActionEvent` carries the same identity fields, the configured
`actionId`, and the exact snapshot accepted for that action. Custom actions do
not finish the platform selection mode or clear Readium selection, so the
consumer can present React Native UI and then explicitly clear when its flow
is complete. Android keeps that mode alive but repeatedly hides its floating
toolbar after a custom action so it cannot obscure the consumer-owned surface;
the native handles and selection lifecycle remain active. If Android replaces
`ActionMode` during rotation or another configuration change, a short
recreation grace period carries that suppression onto the replacement instead
of flashing the toolbar over the consumer surface. Platform/system
commands may retain or dismiss selection according to native convention; their
end is reported through the lifecycle event rather than masquerading as a
custom action.

Source replacement, navigator recreation, close, and view disposal cancel
pending selection work. The generation and instance identity let consumers
discard stale UI even if a callback was already crossing the bridge.

## Rights and payload bounds

Both adapters query Readium's publication rights before exposing selected
text. When copy is prohibited:

- `copyAllowed` is `false`;
- public `text` is empty;
- the locator's text context is removed; and
- canonical locator locations remain available for an annotation decision.

Selected text is limited to 8,192 UTF-16 units. Locator context is limited to
512 units before and 512 units after the highlight. Bounds are applied only at
Unicode grapheme boundaries, so emoji sequences, combining marks, Arabic, and
Urdu clusters are not split. `truncated` becomes `true` when any of those three
values is shortened. No selected text is written to native logs or support
diagnostics.

Text stays in logical Unicode order regardless of visual bidi layout.
Direction is conservative first-strong inference over the bounded selection:
Hebrew/Arabic-family characters produce `rtl`, another Unicode letter
produces `ltr`, and text without a strong letter produces `auto`.

## Geometry

Selection geometry is optional because Readium may have a valid locator while
the selected range has no finite on-screen frame. When present, it uses the
shared `reader-view-and-window-v1` record:

- `viewport`: native reader size;
- `viewRect`: aggregate range bounds relative to the React Native reader view;
- `windowRect`: the same range relative to the native window;
- `visibleViewRect`: `viewRect` clipped to the reader viewport; and
- `visibleWindowRect`: that clipped rectangle converted to the window.

All values are logical units: UIKit points on iOS and density-independent
pixels on Android. Consumers should anchor an in-reader overlay from
`visibleViewRect` and a window-level overlay from `visibleWindowRect`. The
unclipped rectangles are retained for diagnostics and animations. Rectangles
may have negative origins, but dimensions are finite and non-negative.

iOS converts Readium's navigator-view frame through UIKit. Readium Kotlin
3.1.2 exposes physical-pixel bounds and may reverse RTL edges, so Android first
canonicalizes the edges, converts through the publication/reader/window
offsets, divides by actual display density, and then clips in reader space.
The normalized records deliberately do not expose the toolkit-native pixel or
point rectangle as a second consumer coordinate system.

The current contract reports one aggregate range rectangle. It does not claim
per-line client rectangles; adding those would require an additive versioned
record after native support exists on both platforms.

## Platform implementation

- iOS installs system Copy plus up to eight unique `EditingAction` selectors
  in `EPUBNavigatorViewController.Configuration`. A bounded monitor observes
  `currentSelection` for range/frame changes.
- Android supplies Readium's native `selectionActionModeCallback`, restores
  rights-aware Copy, captures the selection before action dispatch, and uses a
  bounded monitor while `ActionMode` is active. The first two custom actions
  request visible toolbar placement; the system may place remaining actions
  in overflow. Replacement modes created during configuration changes inherit
  the hidden-toolbar state of an active custom-action flow.
- Neither platform clears selection after a custom action. Both expose the
  same explicit command and stable lifecycle records.

## Verification

The production matrix runs the same generated English and Urdu targets on an
iPhone 17 Pro simulator with iOS 26.5 and a Pixel 8 emulator with Android API
36.1. It covers:

- LTR and RTL logical text/order;
- Highlight, Note, and Share Quote custom actions;
- native Copy and publication-rights metadata;
- exact action-event versus `getCurrentSelection()` parity;
- active handles after custom actions and explicit clear;
- native dismissal as a distinct terminal reason;
- portrait geometry on both platforms; and
- Android landscape clipping, reader/window conversion, and rotation.

TypeScript, production Swift, and production Kotlin also execute the same
action-policy and shared `core-v1` fixtures. All three test action bounds and
direction; Swift and Kotlin test grapheme-safe prefix/suffix bounds directly;
Kotlin additionally tests pure density, offset, clipping, and invalid-geometry
normalization. The device matrix exercises the UIKit conversion path and both
atomic native open envelopes. Android 16 exposes its landscape floating toolbar
in a system-owned window that Maestro does not include in its accessibility
tree; the deterministic landscape harness uses one calibrated system tap for
that visible native item and asserts all resulting records through public UI.
This is a test-driver limitation, not a runtime fallback.
