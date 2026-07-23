# Navigation-unit boundaries and history

Status: implemented for the 0.x SDK track.

## Outcome

Native EPUB Kit can enforce the same derived navigation-unit boundaries used by
chapter progress, expose exact previous/current/next state, navigate directly
between unit starts, and maintain a bounded in-memory return stack for explicit
jumps. The native hosts remain the authority for whether a user turn crosses a
boundary; React Native owns derivation and ephemeral history.

Set `chapterGranularity` on `EpubReaderView` to opt into this behavior. The
value is the same `top-level | leaf | { depth }` policy accepted by
`getNavigationUnits()`. Omitting it retains reading-order-resource enforcement
and raw location callbacks.

## Public surface

```tsx
<EpubReaderView
  ref={readerRef}
  source={{ kind: 'file', uri }}
  chapterGranularity="top-level"
  navigationPolicy={{ chapterTurnGesture: 'disabled' }}
  onNavigationUnitBoundary={(event) => {
    console.log(
      event.boundary,
      event.navigationUnit.title,
      event.adjacentNavigationUnit?.title,
      event.precision
    );
  }}
  onNavigationHistoryChange={(history) => {
    console.log(history.canGoBack, history.entries.length);
  }}
/>
```

The stable ref adds:

- `getNavigationUnitContext()` for the current exact unit, previous/next units,
  start/end state, chapter progress, locator, precision, and generation;
- `NavigationUnitContext.atLastPosition` as a non-completion hint that position
  precision is within the unit's final known discrete position;
- `goToNavigationUnit(id)` for a stable unit ID;
- `goToNextNavigationUnit()` and `goToPreviousNavigationUnit()` in canonical
  publication order;
- `getNavigationHistory()`, `clearNavigationHistory()`, and `goBack()`.

All returned records are detached from internal state. Unknown unit IDs reject
with `INVALID_LOCATOR`. Previous/next return `false` at publication edges.
Explicit commands remain legal when user page or chapter gestures are disabled.
After a successful explicit jump, `getCurrentLocation()`, ordinary location
events, and `getNavigationUnitContext()` converge on the destination resource.
On Readium Swift, the host preserves the delegate-accepted destination when an
animated resource jump has visually settled but the toolkit's
`currentLocation` still names the source resource; it uses that fallback only
when the destination is represented in the current viewport and the stale
source is not.

On Readium Kotlin, fragment settlement accepts either an exact visible-element
Locator match or a bounded DOM proof that the requested anchor is already
inside the current resource viewport. The latter matters when the browser
correctly declines to scroll an already-visible footnote target and therefore
does not promote that target to the first-visible Locator. Resource identity
and the requested fragment are still required, so an unrelated visible anchor
cannot complete the command.

## Exact boundary installation

After native `ready`, the wrapper loads one coherent publication/position
snapshot, derives units, and installs a compact native boundary configuration
for the same `instanceId` and `generation`. Enriched location delivery remains
buffered until native installation succeeds, preventing JavaScript progress
from claiming a finer policy than the native gesture guard actually enforces.

Readium Swift can deliver its first stable location just after publication data
becomes ready. Installation therefore accepts the native current-location
command when populated or waits, for at most two seconds, for that generation's
first ordered location event. A different identity is rejected; no configuration
is carried across a source replacement.

The native policy reports:

- `boundaryGranularity: 'navigation-unit'` after exact configuration;
- `boundaryPrecision: 'continuous' | 'position' | 'resource'` for the least
  precise membership representation available for every configured unit;
- `reading-order-resource/pending` with
  `navigation-unit-boundaries-loading` while exact data is not installed; or
- `reading-order-resource/resource` when `chapterGranularity` was omitted.

Continuous membership is used only when every unit has a non-empty overall
progression interval. Position membership is used only when every unit has a
non-empty one-based position interval. Otherwise the configuration explicitly
downgrades to normalized resource/fragment matching. This avoids presenting a
mixed or guessed precision as exact.

## Fail-closed user movement

With chapter gestures disabled, a paginated native host compares every
user-location candidate with the last accepted locator and its configured unit
membership. A candidate in another unit is restored without animation. The
candidate never becomes an accepted stable checkpoint.

While exact boundaries are required but still loading, paginated directional
movement is also rejected. This short fail-closed window prevents a fast first
swipe from escaping the unit under a temporary resource-only approximation.
Ordinary vertical scrolling remains available in scrolled layout.

After a successful exact rollback, `onNavigationUnitBoundary` emits:

- stable instance/generation/sequence identity;
- logical `forward | backward` direction and matching `end | start` side;
- the current unit and immediate adjacent unit;
- the restored canonical locator; and
- the membership precision actually used for that comparison.

Canonical unit order is never reversed for RTL. Physical horizontal input is
still mapped through the runtime navigation policy before boundary direction is
reported.

## Command and history semantics

History records the canonical source locator before a successful explicit jump.
The default behavior is:

| Command                                                              | Default history |
| -------------------------------------------------------------------- | --------------- |
| `goTo`, `goToPosition`, `goToProgression`, `goToNavigationUnit`      | `push`          |
| `goForward`, `goBackward`, `goToNextNavigationUnit`, `goToPrevious…` | `ignore`        |
| `goBack`                                                             | pop only        |

Any movement command accepts `{ history: 'push' | 'ignore' }` to override its
default. A source locator is pushed only when native movement succeeds.
Successfully followed ordinary internal hyperlinks also push their exact
native-captured source Locator; intercepted external and blocked links never
do. This event adaptation is required because ordinary hyperlinks are followed
inside the native navigator rather than through a JavaScript ref command.
Consecutive duplicate locators are not added. `goBack()` removes an entry only
after the native restore succeeds, so a failed restore does not destroy the
return target.

The stack is limited to 64 entries and evicts the oldest entry first. It is
scoped to one mounted native generation, resets on every ready identity change,
and is cleared on close, failure, unmount, or explicit clear. The package never
persists history; durable reading position and product-level visit history
remain consumer-owned.

## Shared executable contract

`packages/testing/contracts/navigation-boundaries-v1/cases.json` freezes the
64-entry limit plus continuous, position, exact-fragment, preferred-unit, and
publication-end membership cases. TypeScript, Swift, and Kotlin consume the
same fixture. TypeScript additionally tests immutable history push/pop/clear,
deduplication/eviction, context derivation, precision downgrade, exact event
parsing, and stale-identity rejection.

## Device verification

The installed example journey on iOS and Android proves:

- exact boundary status after ordered startup;
- current/previous/next context and direct unit-start commands;
- next then previous movement in canonical order;
- nested TOC jump, one-entry history push, back restore, and clear;
- disabled paginated crossing rollback; and
- an exact `Part one → Part two` current/adjacent boundary event.

The stable API, preferences, progress-gesture, navigation/restore, and
reader-progress suites are replayed afterward. The example keeps the new probe
inside existing harness geometry so fixed-coordinate native swipe tests continue
to target the Readium view.

## Ownership and limitations

- Unit derivation remains defined by the navigation-unit policy; native code
  receives immutable intervals and does not reinterpret the TOC.
- History is for jump-and-return behavior, not furthest progress or durable
  bookmarks.
- Resource precision can distinguish same-resource units only when the locator
  contains a matching fragment; consumers should inspect reported precision.
- Boundary callbacks describe rejected user crossings. Explicit commands report
  success through their promise and normal ordered location callbacks.
- A successful programmatic resource jump emits its resolved target immediately;
  a later viewport probe cannot regress the public current location to a source
  resource that is no longer visible.
- Publication-edge directional attempts can resolve without a new Readium
  locator candidate; explicit previous/next commands reliably return `false` at
  those edges.
