# Progress and gesture qualification

This record describes the LIB-016 feasibility implementation. It proves that
official Readium navigators can report useful scrolled-reading progress, block
accidental cross-resource horizontal turns, and retain explicit next-resource
navigation on iOS and Android. The event and signal props are qualification
surfaces; stable records, commands, chapter units, persistence, and runtime
gesture policy are defined later in LIB-020 through LIB-033.

## Outcome

The qualification passed on an English left-to-right publication and an Urdu
right-to-left publication on both platforms. In each publication:

- vertical scrolling advanced progress without leaving the current resource;
- a horizontal gesture in the reading direction did not change the resource;
- an explicit native next-resource action reached the next linear resource;
- every event retained native view instance and publication generation
  ownership; and
- progress exposed its reason and measured precision instead of implying
  cross-platform viewport parity.

The implementation uses the pinned official Readium Swift and Kotlin engines.
No Readium source was forked, copied, or patched.

## Navigator configuration and gesture policy

Both native hosts configure Readium for vertical scrolling and disable page
turns while the scroll view is active:

| Platform | Configuration                                                                |
| -------- | ---------------------------------------------------------------------------- |
| iOS      | `EPUBPreferences(scroll: true)` and `disablePageTurnsWhileScrolling: true`   |
| Android  | `EpubPreferences(scroll = true)` and `disablePageTurnsWhileScrolling = true` |

The qualification policy is deliberately fixed to disabled. A runtime
consumer preference is not exposed by this spike. LIB-032 will implement the
configurable policy, keep cross-chapter swiping off by default, and define how
preference changes interact with the active navigator.

Blocking the gesture does not remove explicit navigation. The qualification
next action finds the current resource in `publication.readingOrder`, selects
the next link, and calls Readium's non-animated native `go` operation. The
result event includes the source locator, resulting locator, success, platform,
instance, and generation. This raw reading-order step is enough for
feasibility; LIB-030 will derive production navigation units from reading
order, TOC structure, fragments, landmarks, and non-linear-resource policy.

## Progress event

`ReaderProgressEvent` carries:

| Field                                  | Meaning                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `locator`                              | Full current Readium Locator JSON                                      |
| `resourceProgress`                     | Clamped `0...1` progression within the current resource                |
| `overallProgress`                      | Best available clamped publication progression                         |
| `resourceIndex`, `totalResources`      | Current raw reading-order position                                     |
| `position`, `totalPositions`           | Optional Readium position-list coordinates                             |
| `viewport`                             | Optional iOS continuous visible range and visible resources            |
| `visibleStartLocator`                  | Optional Android first-visible-element fallback from an explicit probe |
| `precision`                            | `continuous`, `position`, or `resource`                                |
| `reason`                               | `initial`, `user-scroll`, `programmatic`, or `probe`                   |
| `layout`, `chapterTurnGesture`         | Measured qualification policy (`scrolled`, `disabled`)                 |
| `platform`, `instanceId`, `generation` | Stale-event ownership                                                  |

All numeric progress values reject non-finite input and clamp to `0...1`.
When native total progression is unavailable, overall progress falls back to
`(resourceIndex + resourceProgress) / totalResources`. The first event owned by
a publication generation is always `initial`; later location changes are
`user-scroll` unless an explicit native navigation is in flight. The
qualification buttons can request a `probe` snapshot or a `programmatic` next
action, but these prop counters are not the production imperative API.

iOS coalesces location and viewport callbacks over 120 milliseconds. Android
collects Readium's `currentLocator` state after position metadata is available.
All observation, metadata, probe, and navigation tasks/jobs are canceled on
source replacement, unmount, or teardown and check instance/generation plus
publication/navigator identity before emitting.

## Honest platform precision

The pinned Swift revision exposes Readium's viewport-observing API. iOS can
therefore include a continuous overall visible range, the visible resource
ranges, and optional visible positions. Its final qualification precision is
`continuous`.

Readium Kotlin 3.1.2 does not expose an equivalent full viewport range. Android
uses its live current locator, optional publication positions, and
`firstVisibleElementLocator()` when an explicit probe is requested. Its final
qualification precision is `position` when the locator and position list are
available, otherwise `resource`.

The generated fixtures intentionally reveal that distinction. Their Readium
position lists are coarse (one position per reading-order resource), while the
current locator's `resourceProgress` still advances during vertical scrolling.
Consumers must therefore use `precision` when presenting overall progress and
must not infer an iOS-style visible range from the Android fallback. Production
code may improve Android precision after an isolated Readium upgrade, but the
contract remains explicit even if platform capabilities converge.

## Fixture and runtime proof

The deterministic English fixture contains two long linear resources. Each
has enough authored content to require ordinary vertical motion, and the
second exposes a unique `Second chapter` target. The RTL fixture contains a
long Urdu resource and a second linear Urdu continuation with the unique
heading `اردو مطالعہ دوم`.

The shared Maestro flow starts each publication at its first resource and then:

1. performs a horizontal gesture in the publication's reading direction;
2. probes and asserts the original resource locator is unchanged;
3. performs a vertical gesture and asserts resource progression advanced by
   more than `0.01` while the resource locator stayed unchanged;
4. invokes explicit next-resource navigation;
5. asserts the exact source and destination resource locators; and
6. asserts the intended second-resource content is visible.

The same flow receives platform-specific expected precision and viewport
fallback values. Android proves `position` plus `locator`/`anchor`; iOS proves
`continuous` plus `range`. Final reports and screenshots live under
`artifacts/LIB-016/final`.

## Qualification-only API boundaries

- `progressProbeSignal` and `nextResourceSignal` are diagnostic prop counters,
  not stable commands.
- `NavigationActionEvent` reports one raw next-reading-order operation; it is
  not chapter history or boundary policy.
- `ReaderProgressEvent` is a feasibility shape. LIB-020 will freeze matching
  TypeScript, Swift, and Kotlin records and preserve unknown locator fields.
- Chapter progress, overall book presentation, continuation UI, previous/next
  history, and persisted restore belong to LIB-023, LIB-024, and LIB-030 through
  LIB-033.
- Runtime gesture enablement, accessibility announcements, reduced motion,
  physical devices, tablets, very large resources, and high-frequency
  performance remain production-matrix work.
- A future Readium Kotlin upgrade must be isolated, re-run this matrix, and
  either retain the fallback or explicitly raise Android precision.

The spike establishes a viable contract without hiding native asymmetry or
coupling consumer UI to Readium-specific callbacks.
