# Native view lifecycle qualification

This document records the navigator-containment architecture proven by
LIB-011 and hardened by LIB-021. Production publication ownership and source
resolution are documented in the
[production publication session](./production-publication-session.md).
The public source, lifecycle events, and commands are frozen separately in the
[stable native view API](./stable-native-view-api.md); the older
`onReaderState` payload remains only inside namespaced qualification hooks.

## Ownership model

Each mounted `EpubReaderView` owns one opening operation, at most one production
`PublicationSession`, and at most one platform navigator in steady state.
JavaScript owns the view's presence and source prop. The session owns source
access, transient assets, the Readium publication, and resource closure. The
view owns cancellation generations and navigator containment.

A monotonically increasing generation token is captured before each
asynchronous open. An open may mutate visible state only when its token is still
current, the view remains mounted, and the native host is usable. A source
replacement, unmount, host destruction, or explicit disposal advances the
generation before cancelling work and closing resources. This prevents a stale
open from attaching after a newer source or a remount has taken ownership.

The provisional native state event reports:

- `idle`, `opening`, `waitingForHost`, `ready`, `error`, `closing`, or
  `unmounted`;
- a native view instance ID and the instance-scoped generation that owns the
  state;
- whether this view has an attached navigator; and
- `hostNavigatorCount`, a qualification diagnostic used to detect retained
  navigators across destructive lifecycle tests.

## iOS containment

The Swift view opens an asset and publication in a cancellable `Task`, creates
an `EPUBNavigatorViewController`, and finds the nearest responder-chain view
controller. It uses the complete UIKit child-controller sequence:

1. `addChild`;
2. insert and size the navigator view;
3. `didMove(toParent:)`.

Teardown performs the inverse containment sequence before dropping the
publication. `didMoveToWindow` is the mount boundary. Source replacement and
window removal invalidate the prior generation before teardown.

## Android containment

The Kotlin view contains a real `FragmentContainerView` and requires a
`FragmentActivity` host. It opens the publication in a view-owned main-thread
coroutine scope, creates `EpubNavigatorFragment` with Readium's
`EpubNavigatorFactory`, and adds it synchronously through the host's support
`FragmentManager`.

The factory is used directly; the library never replaces the activity's global
`FragmentFactory`. Attachment waits while fragment state is saved or the host
is below `STARTED`, then retries from the activity lifecycle observer. Unmount
removes the fragment synchronously (allowing state loss only after host state
has already been saved), closes pending and active publications, and advances
the generation.

The fragment container uses the package resource ID
`R.id.native_epub_kit_fragment_container`. React Fabric also assigns small
integer view tags, so `View.generateViewId()` is unsafe here: qualification
reproduced a collision after repeated remounts and replaced it with the
resource-space ID.

Fragment identity is separate from container identity. LIB-021 reproduced a
stale restored navigator after an internal link followed by React
unmount/remount: the prior tag combined the constant container ID with a
generation that restarted for every native view. Tags now include the random
native `instanceId`, resource-space container ID, and generation. A remounted
view therefore cannot claim a fragment created by an older instance.

Readium exposes Fragment KTX as an implementation dependency. The package
therefore declares AndroidX Fragment KTX 1.8.7 directly and pins it in the
canonical native dependency manifest because the host code compiles against
`FragmentActivity`, `FragmentContainerView`, and `FragmentManager`.

### Android readiness barrier

Android does not expose the public `ready` state as soon as the publication
object and detached metadata are available. The adapter waits for two
generation-scoped signals:

1. the publication/TOC/positions snapshot has finished mapping; and
2. Readium's pagination listener has reported that the first visible resource
   is loaded.

Only the transition that observes both signals installs progress observation
and emits `ready`. A 20-second native timeout tears down the session and emits
a recoverable render error if the viewport never becomes usable. Source
replacement and unmount reset the gate, so a late page callback cannot release
a newer generation.

This barrier is required by Readium Kotlin 3.1.2. Its navigator accepts a
cross-resource `go()` while the first resource is still loading, but suppresses
canonical locator updates until that initial load completes. A consumer that
jumped immediately after a metadata-only ready signal could therefore move the
visible pager while leaving the locator flow permanently at the cover. The
APP-001 private-corpus run reproduced that race; the same EPUB now opens,
navigates to beginning/middle/near-end positions, and closes with released
resources on both the standard and constrained Android emulators.

## Qualified lifecycle matrix

The same generated, publicly reusable EPUB 3 fixture rendered through the
official Readium navigator on iPhone 17 Pro / iOS 26.5 and Pixel 8 / Android API
36.1. A single Maestro flow passed on both platforms after exercising:

| Scenario                    | Expected invariant                                            |
| --------------------------- | ------------------------------------------------------------- |
| Initial mount               | One `ready` event and exactly one host navigator              |
| Source replacement          | Prior generation closes; replacement becomes ready            |
| Ten unmount/remount cycles  | Every remount becomes ready with host count one               |
| Portrait/landscape rotation | Reader returns ready without duplicate host                   |
| Background/foreground       | Existing or recreated view returns ready                      |
| Process stop and launch     | New session renders the fixture without restored orphan state |

The final clean-CNG builds passed native compilation, Android unit tests/lint,
and the full device flow. JUnit reports and screenshots live under
`artifacts/LIB-011` in the development repository.

## Current limits

- One concurrent `EpubReaderView` per Android `FragmentActivity` is qualified.
  The stable resource ID deliberately rejects ambiguous multi-reader fragment
  ownership; a resource-ID pool or parent-fragment contract is required before
  multiple simultaneous readers can be supported.
- Expo SDK 56's generated `MainActivity` calls `super.onCreate(null)`. Activity
  recreation is therefore qualified as a new React/native reader session, not
  as restoration of a serialized publication-bound fragment. A bare/custom
  React Native activity that forwards `savedInstanceState` is not yet
  supported.
- Reading-position restoration is not part of this spike. The stable Locator
  contract and initial-location behavior are implemented in LIB-020 through
  LIB-024.
- Local file and real Android `content:` URI sources are qualified by LIB-021.
  Remote sources are explicitly disabled. Source validation, stable errors,
  security-scope ownership, and repeated-session closure are recorded in the
  production session document.
- The provisional state event and `hostNavigatorCount` diagnostic are not a
  frozen public API.

Source preflight, exactly-once events, error mapping, and resource closure are
recorded historically in the
[publication lifecycle qualification](./publication-lifecycle.md) and
currently in the
[production publication session](./production-publication-session.md).

These boundaries are compatibility facts, not hidden fallbacks. They must be
removed or carried into the published support matrix before a stable release.
