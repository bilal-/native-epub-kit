# Stable native view API

LIB-022 freezes the lifecycle-level React boundary on top of the production
publication session. Consumers use the exported React component and ref only;
the example does not require a native module singleton, view manager, tag, or
platform controller.

## Public surface

The stable lifecycle slice is deliberately smaller than the eventual complete
reader API:

```tsx
const readerRef = useRef<EpubReaderViewRef>(null);

<EpubReaderView
  ref={readerRef}
  source={{ kind: 'file', uri: localEpubUri }}
  preferences={preferences}
  footnotePolicy={{ mode: 'semantic' }}
  linkPolicy={{ externalLinks: 'intercept', unsupportedSchemes: 'block' }}
  onStateChange={handleState}
  onReady={handleReady}
  onError={handleError}
  onLocationChange={handleLocation}
  onPreferencesChange={handlePreferences}
  onFootnotePress={handleFootnote}
  onLinkPress={handleLink}
/>;
```

`source` accepts the stable `PublicationSource` union and may be `null` to keep
the view mounted without a publication. The TypeScript facade validates and
detaches the record, serializes it across the internal bridge, and both native
platforms decode and validate the same shared record again before opening. The
internal serialized prop is not a consumer API.

The ref grows only when an owning feature task has passed its native acceptance
gate. Its lifecycle, publication-data, and navigation slice is now:

```ts
interface EpubReaderViewRef {
  search(query: string, options?: ReaderSearchOptions): Promise<ReaderSearchSession>;
  getSearchPage(sessionId: string, cursor?: string): Promise<ReaderSearchPage>;
  cancelSearch(sessionId: string): Promise<void>;
  goTo(target: Locator | PublicationLink, options?: NavigationOptions): Promise<boolean>;
  goToProgression(progression: number, options?: NavigationOptions): Promise<boolean>;
  goToPosition(position: number, options?: NavigationOptions): Promise<boolean>;
  goToNavigationUnit(id: string, options?: NavigationOptions): Promise<boolean>;
  goToNextNavigationUnit(options?: NavigationOptions): Promise<boolean>;
  goToPreviousNavigationUnit(options?: NavigationOptions): Promise<boolean>;
  goBack(options?: NavigationOptions): Promise<boolean>;
  goForward(options?: NavigationOptions): Promise<boolean>;
  goBackward(options?: NavigationOptions): Promise<boolean>;
  clearNavigationHistory(): Promise<void>;
  getCurrentLocation(): Promise<ReaderLocationEvent | null>;
  getNavigationUnitContext(): Promise<NavigationUnitContext | null>;
  getNavigationHistory(): Promise<ReaderNavigationHistoryState>;
  getCurrentSelection(): Promise<ReaderSelectionSnapshot | null>;
  clearSelection(): Promise<void>;
  getPublication(): Promise<PublicationInfo>;
  getPositions(request?: PublicationPositionsRequest): Promise<PublicationPositionsPage>;
  getPreferences(): Promise<ReaderPreferencesStatus>;
  getNavigationPolicy(): Promise<ReaderNavigationPolicyStatus>;
  getDiagnostics(): Promise<ReaderDiagnostics>;
  resolveImageSource(
    source: ReaderImageSource,
    use: 'zoom' | 'share'
  ): Promise<ReaderResolvedImageSource>;
  releaseImageSource(id: string): Promise<void>;
}
```

Bounded generation-scoped native search was added by LIB-080. See the
[native search-session record](./search.md) for request normalization,
forward-only cursors, cancellation, result limits, locator/excerpt mapping,
and isolated decoration groups.

Publication metadata and bounded positions were added by LIB-023 after the
lifecycle slice froze. Canonical navigation and initial restore were added by
LIB-024. See the [publication-data record](./publication-data.md) for detached
mapping, paging, and generation identity, and the
[navigation and restore record](./navigation-and-restore.md) for command and
restore semantics. Stable rendering preferences and their publication-aware
status were added by LIB-025; see the
[reader-preferences record](./reader-preferences.md). Decorations are owned by
LIB-061 and search by LIB-080. Additive 0.x work extends the ref only when the
corresponding native capability passes its acceptance gate.

Derived unit commands, exact rejected-crossing events, and bounded jump/back
history were added by LIB-033. See the
[navigation-unit boundaries/history record](./navigation-boundaries-history.md)
for generation ownership and command-specific history defaults.

The redaction-safe capability and support snapshot was added by LIB-026. See
the [support-diagnostics record](./support-diagnostics.md) for version pinning,
feature-stage semantics, warning bounds, and fields that are deliberately
excluded from issue reports.

Synchronous native footnote interception and hyperlink policy were added by
LIB-050. `footnotePolicy`, `linkPolicy`, `classifyFootnote`,
`onFootnotePress`, and `onLinkPress` are stable top-level props. See the
[production footnote/link record](./footnotes-links.md) for classification,
content bounds, canonical locator ownership, scheme safety, and the optional
geometry limitation of current Readium activation hooks.

Configured production selection actions and lifecycle events were added by
LIB-060. `selectionActions`, `onSelectionAction`, and `onSelectionChange` are
stable top-level props, while `getCurrentSelection()` and `clearSelection()`
share the same canonical snapshot and explicit terminal lifecycle. See the
[production selection record](./selection.md) for rights, bounds, native menu
ownership, and normalized geometry.

Image activation and bounded source materialization were added by LIB-072.
`imagePolicy` and `onImagePress` are stable top-level props;
`resolveImageSource()` and `releaseImageSource()` are generation-scoped ref
commands. See the [production image record](./images.md) for source kinds,
rights semantics, resource limits, cleanup, and the explicit Android
fixed-layout capability gap.

## Event identity and order

Every public lifecycle and location event carries one native `instanceId`, an
instance-scoped source `generation`, and a `sequence` that starts at zero for
that generation. The native event protocol rejects a generation older than the
current one. A new generation resets both sequence and location-throttle state.

For a successful open, callbacks have this order:

```text
onStateChange(opening, sequence 0)
[onStateChange(waitingForHost, sequence 1)]
onStateChange(ready, sequence N)
onReady(ready, same identity and sequence N)
onLocationChange(initial, sequence N + 1)
```

`onReady` is derived synchronously from the exactly-once native `ready` event;
it does not consume a second sequence value. It therefore cannot arrive before
the matching state callback or describe a different generation.

For an open/render failure:

```text
onStateChange(opening, sequence 0)
onError(error, sequence N)
onStateChange(error, same error/identity/sequence N)
```

The complete stable `ReaderError` reaches `onError` before the state callback,
so a consumer can store the cause before rendering its error state. Native
state gates emit each accepted state once, and the facade has unit tests for
ready/error callback projection order.

## Location throttling

Initial, programmatic, restored, and preference-driven locations bypass the
scroll rate limit. Consecutive `user-scroll` events in the same generation are
limited to one public event per 120 ms, or at most about 8.3 events per second.
Qualification diagnostics do not consume the stable sequence and do not alter
this contract.

iOS already coalesces viewport callbacks before the shared rate guard. Android
collects Readium's current-locator flow and applies the same final guard. The
latest accepted stable event is cached for `getCurrentLocation()`. Event
payloads pass the production `ReaderLocationEvent` validator, including
reason, precision, canonical Readium Locator, and monotonic identity.

## Command readiness and rejection

Commands are never silently queued across a source generation:

| View state                                                           | Result                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| `ready`                                                              | Execute against the exact active session/navigator       |
| `idle`, `opening`, `waitingForHost`, `error`, `closing`, `unmounted` | Reject with recoverable `READER_NOT_READY` / `render`    |
| Native view destroyed or retained JS ref after unmount               | Reject with non-recoverable `READER_DESTROYED` / `close` |

Native view functions return a private success/error envelope so the complete
stable error record crosses the Expo view-function bridge without depending on
platform exception metadata. The TypeScript facade validates the envelope and
throws `NativeEpubKitError`. Malformed native results become non-recoverable
`NATIVE_INVARIANT_VIOLATION`; raw exceptions or stack traces never become
consumer control flow.

`getCurrentLocation()` returns the most recent accepted event, or `null` during
the narrow ready-before-initial-location interval. `getCurrentSelection()`
returns the current canonical selection when native handles exist and `null`
otherwise. `clearSelection()` is idempotent while ready.

`getPublication()` and `getPositions()` use the same readiness matrix. They
read an immutable snapshot belonging to the exact ready generation; source
replacement never lets a page resolve against the next publication.

`getPreferences()` also uses this matrix. It returns the latest validated
requested/applied/support status for the exact generation; it never reads
application persistence or queues a future update.

`getDiagnostics()` reads that same generation's already-detached publication
and preference snapshots. It does not query application persistence or expose
publication identity/content, source values, current location, or native
exception metadata.

Image resolution uses the same readiness matrix and additionally requires a
live handle from the active generation plus an allowed `zoom` or `share` use.
`releaseImageSource()` is safe after a prior release; teardown removes every
remaining materialized file.

Search uses the same readiness matrix. Only one generation-scoped session is
active, a new query cancels its predecessor, and every page cursor is
forward-only and single-use. Close, replacement, unmount, and disposal release
the native iterator. See the [native search-session record](./search.md).

## Concurrency and lifetime

- Source replacement advances the native generation before cancelling the old
  task and session.
- A command resolves only from the view instance on which it was invoked; it
  cannot migrate to a replacement generation.
- Commands execute on the native UI thread. The Swift Expo DSL boundary makes
  its documented main-queue guarantee explicit with `MainActor.assumeIsolated`.
- Ref calls do not wait for `ready`; consumers use `onReady` or handle the typed
  recoverable rejection.
- A retained public ref object detects loss of its internal native ref and
  produces `READER_DESTROYED` without touching a stale native tag.
- Unmount, source clearing, source replacement, and native disposal retain the
  idempotent session cleanup proved by LIB-021.

## Qualification hooks

The example still needs device-only probes for raw progress and explicit
next-resource fallbacks while their owning production tasks are pending. They
are grouped under the explicit `unstable_qualification` prop; none is mixed
into the stable top-level API. They may change without a stable compatibility
promise and are excluded from ordinary usage examples. Typography profiles,
footnote/link events, selection actions/lifecycle, and image activation have
graduated to stable top-level props.

## Verification

One `reader-api-v1` JSON contract runs in TypeScript, production Swift, and
production Kotlin. It fixes the 120 ms constant, the command readiness matrix,
per-generation sequencing, stale-generation rejection, and urgent-event
bypass. TypeScript separately tests native command envelope validation and
ready/error callback order.

The stable API device flow passes on iPhone 17 Pro / iOS 26.5 and Pixel 8 /
Android API 36.1. It proves object-source open, ordered ready plus initial
location, successful location ref, not-ready rejection while closed, destroyed
rejection through a retained ref after unmount, remount recovery, typed remote
error, and valid-source recovery. Production selection/action, adversarial
source, typography, footnote/link, LTR/RTL progress, and destructive lifecycle
suites also pass on both platforms after the API replacement.
