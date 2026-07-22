# Navigation and locator restore

LIB-024 adds canonical Readium navigation to the stable reader ref without
adding persistence or product navigation UI to the headless package. The same
public calls execute against the active `EPUBNavigatorViewController` on iOS
and `EpubNavigatorFragment` on Android.

## Public API

```tsx
const readerRef = useRef<EpubReaderViewRef>(null);

<EpubReaderView
  ref={readerRef}
  source={{ kind: 'file', uri: localEpubUri }}
  initialLocator={savedLocator}
  onLocationChange={({ locator }) => saveLocator(locator)}
/>;
```

```ts
const publication = await readerRef.current!.getPublication();
const chapter = publication.tableOfContents[0];

await readerRef.current!.goTo(chapter);
await readerRef.current!.goTo(savedLocator, { animated: true });
await readerRef.current!.goToProgression(0.5);
await readerRef.current!.goToPosition(42);

const movedForward = await readerRef.current!.goForward();
const movedBackward = await readerRef.current!.goBackward();
```

`goTo()` accepts either a canonical `Locator` or a detached
`PublicationLink` returned by `getPublication()`. Links retain their fragment
targets, and native lookup covers the publication TOC, reading order,
resources, links, and nested children. A locator is normalized through the
active Readium publication before it reaches the navigator.

Publication progression uses the closed range `0...1`. Positions are
one-based values from the active generation's immutable positions snapshot;
the bridge rejects zero, fractional values, and values above `2,147,483,647`.
The position must also exist in that publication. Changing source generation
invalidates the previous position snapshot and all of its navigation targets.

`animated` defaults to `false` and is best effort. Its exact visual treatment
belongs to the pinned native toolkit and layout mode; it does not alter command
completion or error semantics.

`history` is an optional `push | ignore` policy added by the derived-unit
layer. Direct locator/link/progression/position/unit jumps push their source
locator by default; logical and next/previous movement ignore history by
default. See the
[navigation-unit boundaries/history record](./navigation-boundaries-history.md).

## Result and error semantics

| Operation                  | Native move succeeds | No logical content remains | Invalid or unresolved target | Navigator refuses a direct jump                 |
| -------------------------- | -------------------- | -------------------------- | ---------------------------- | ----------------------------------------------- |
| `goTo*`                    | Resolves `true`      | Not applicable             | Rejects `INVALID_LOCATOR`    | Rejects `NAVIGATION_FAILED`                     |
| `goForward` / `goBackward` | Resolves `true`      | Resolves `false`           | Not applicable               | Resolves `false` only at the effective boundary |

All navigation failures have phase `navigate`. Validation failures and native
navigation failures are recoverable. Calls made before `ready`, after a source
generation changes, or through a destroyed ref retain the readiness behavior
documented in the [stable native view API](./stable-native-view-api.md).

Only one public navigation command may own a native view at a time. An
overlapping command rejects with `NAVIGATION_FAILED`; it is never queued into a
later generation. Command and programmatic-location activity use unique tokens
so cleanup from an older async call cannot clear a newer generation's state.

Successful commands immediately publish a stable location with reason
`programmatic`. The native location itself remains canonical; consumers should
persist the event locator rather than infer a CFI, page index, or WebView
offset.

## Programmatic jumps and the disabled chapter gesture

The default chapter-turn gesture guard distinguishes user movement from
explicit API navigation. Every direct locator, link, progression, or position
jump owns a unique in-flight activity token. Because both native toolkits can
deliver the cross-resource locator after the command call returns, the adapter
also retains a bounded, target-resource authorization. A delayed locator is
accepted only when its canonical resource matches that explicit target; an
unrelated cross-resource gesture is still rolled back when chapter swiping is
disabled. Authorization is cancelled on generation change, teardown, failed
navigation, or replacement by a newer command.

The private-corpus APP-001 run exposed the delayed-callback case on iOS: the
native jump succeeded after the command's immediate activity ended, and the
gesture guard initially mistook it for a swipe. Target-aware authorization now
keeps the default (`chapterTurnGesture: "disabled"`) while allowing explicit
chapter and progression controls to work across resources.

Android additionally gates public `ready` on Readium's first visible page, as
documented in the [lifecycle architecture](./lifecycle.md). This prevents an
earlier Readium Kotlin state race in which immediate commands moved the pager
before its locator flow was allowed to leave the initial cover.

## Logical movement in vertical scroll mode

The pinned Readium Kotlin 3.1.2 implementation reports success from
`goForward()` and `goBackward()` while issuing horizontal WebView movement,
which may leave a vertically scrolling publication at the same locator. The
Android adapter therefore waits for an observable canonical-locator change and
then falls back to the adjacent Readium position. If positions are unavailable,
it falls back to the adjacent reading-order resource. It returns `false` only
when neither path can move beyond the current boundary.

iOS uses the native logical navigation result directly. This deliberate
adapter asymmetry produces the same public outcome contract without pretending
that the pinned toolkits expose identical primitives. It can be removed by a
dedicated native-upgrade task after the upstream behavior is requalified.

The reader remains vertically scrolling, and swipe-driven chapter turns stay
disabled. Explicit chapter controls can call `goTo()` with TOC or reading-order
links or use the derived next/previous unit commands built on the same canonical
locator boundary.

## Atomic initial restore

`source` and `initialLocator` cross the React/native boundary as one serialized
open request. Native code validates both before opening, then resolves the
locator through the newly opened publication before creating the navigator.
This avoids a render at the beginning followed by a visible corrective jump.

The first stable location reason is deterministic:

| Open path                                               | First location reason |
| ------------------------------------------------------- | --------------------- |
| Source without an initial locator                       | `initial`             |
| Source with an explicit locator, or native host remount | `restored`            |
| Navigator recreation for a preference change            | `preference-change`   |

An initial locator that is structurally invalid or cannot resolve in the new
publication fails that open with recoverable `INVALID_LOCATOR` / `navigate`.
The reader does not silently open at the beginning.

`initialLocator` is open-time state, not an imperative navigation prop. Once a
source is `ready`, changing only `initialLocator` does not recreate or move the
navigator; call `goTo()` instead. Native unmount and preference recreation
capture the current locator before teardown. Product-level persistence remains
the consumer's responsibility: save locators from `onLocationChange` and pass
the chosen locator with the next source open.

## Cross-platform contract and verification

`packages/testing/contracts/navigation-v1/cases.json` fixes progression and
position bounds, direct-versus-logical outcomes, and first-location reasons.
TypeScript, production Swift, and production Kotlin execute the same fixture.
Additional unit tests cover detached locator/link input, finite-number checks,
native result validation, malformed open requests, and source fingerprinting.

The public device flow runs against generated LTR and RTL EPUBs on iPhone 17
Pro / iOS 26.5 and Pixel 8 / Android API 36. It exercises locator, publication
link, progression, position, forward, backward, invalid-target, end-boundary,
unmount/remount restore, preference recreation, and orientation persistence.
