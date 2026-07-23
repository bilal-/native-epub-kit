# Production publication session

This record describes the production publication ownership boundary introduced
by LIB-021. It replaces the resource-management portions of the LIB-011 and
LIB-012 qualification implementations. LIB-022 now exposes the stable
`PublicationSource` React prop while delegating every open to this one-shot
production `PublicationSession`.

## Ownership boundary

Each open creates a new session with a unique ID. A session may be opened once,
owns every transient native resource created by that open, and is the only
object allowed to close those resources. The native view owns at most one
opening session and one active session while navigator replacement is in
progress; steady state has exactly one active session.

The lifecycle is deliberately monotonic:

```text
initialized -> resolving -> retrieving -> opening -> ready
      |             |           |           |       |
      +-------------+-----------+-----------+-------+-> closing -> closed
                    |           |           |
                    +-----------+-----------+-> failed -> closing -> closed
```

Invalid, repeated, and backward transitions are rejected. `close()` is
idempotent after `closed`, so cancellation, explicit source clearing, native
unmount, host teardown, and deinitialization may safely converge on the same
cleanup path. A failed open is marked `failed` before it closes. A successful
Readium `Publication` takes ownership of its retrieved `Asset`; until that
handoff, the session retains and closes the transient asset itself.

The transition contract is stored once in
`packages/testing/contracts/publication-session-v1/cases.json` and exercised
by the production Swift and Kotlin lifecycle classes. It covers successful
open, source failure, retrieval failure, open failure, and close before open.

## Source policy

Source resolution happens before Readium retrieval and returns stable
`ReaderError` codes. It never exposes a local path, remote header, native stack
trace, or raw Readium diagnostic to JavaScript.

| Source                    | iOS         | Android     | Current policy                                                     |
| ------------------------- | ----------- | ----------- | ------------------------------------------------------------------ |
| Absolute `file:` EPUB URI | Supported   | Supported   | Must exist, be a regular readable file, and end in `.epub`         |
| `content:` URI            | Unsupported | Supported   | MIME is checked when available and a readable descriptor is probed |
| `http:` or `https:` URI   | Disabled    | Disabled    | Rejected as recoverable `UNSUPPORTED_FORMAT` before networking     |
| Other schemes/formats     | Unsupported | Unsupported | Rejected as recoverable `UNSUPPORTED_FORMAT`                       |

Android callers must supply a URI whose read grant remains valid for the
session lifetime. The library probes the caller's existing grant; it does not
silently request or persist a new grant. The runtime proof uses an actual Expo
`FileSystemFileProvider` `content:` URI rather than a mocked resolver.

On Apple platforms, file validation temporarily enters a security-scoped
resource when available. The production session enters the scope again before
retrieval and retains it until the publication closes. A normal app-container
URL may report a successful scope acquisition even though it does not require
one; ownership is therefore recorded by the result of
`startAccessingSecurityScopedResource()` and always balanced by exactly one
`stopAccessingSecurityScopedResource()`.

Remote records remain part of the stable shared record schema so a future
download/cache policy will not require a record redesign. LIB-021 makes no
network request, stores no credentials, and deliberately does not promise
streaming, cache ownership, redirects, authentication, or offline semantics.

## Cancellation and stale-work suppression

The native view advances an instance-scoped generation before starting,
replacing, or cancelling an open. Every asynchronous completion must still
match that generation, the mounted view, and the session identity before it
may attach a navigator or emit visible state. Losing that race closes the
one-shot session immediately. Session cancellation also checks the native task
or coroutine between resolution, retrieval, and opening.

View-state events additionally pass through the existing transition gate,
which rejects duplicate or backward same-generation emissions. Feature work
such as progress, selection, link interception, and typography diagnostics
compares against the active session's publication before emitting. These two
layers prevent an obsolete open or callback from mutating the replacement
reader.

## Navigator and cleanup order

Navigator containment belongs to the native view; publication resources
belong to the session. Teardown performs this order:

1. advance the view generation and cancel pending asynchronous work;
2. remove the iOS child view controller or Android fragment synchronously;
3. clear navigator and pending attachment references;
4. close the active or opening session;
5. close a transient asset or publication, if still session-owned;
6. release an Apple security scope, if acquired; and
7. unregister the session only after every owned-resource flag is zero.

Android fragment tags include the native `instanceId`, container resource ID,
and generation. An earlier tag used only the constant container ID and an
instance-scoped generation. A newly mounted React view could therefore reuse a
tag from a removed view and restore its stale reading position. The destructive
remount/link suite reproduced that collision; `NavigatorHostIdentity` now
makes tags unique across native view instances, and a dedicated unit test
prevents regression.

## Resource and memory instrumentation

Both implementations maintain a process-local resource ledger. It records
active sessions, transient assets, publications, source leases, completed
sessions, forced-release violations, and high-water counts. Unregistering a
session with any ownership flag still set is a test-visible violation. The
qualification event exposes this ledger as `sessionDiagnostics`; it is an
internal acceptance aid, not a frozen LIB-022 public event.

Memory is sampled after each fully closed session using Mach resident size on
iOS and Android PSS on Android. The first five samples are warmup. For the
remaining samples the Tier A LIB-021 guard requires both:

- final growth from the warmup baseline no greater than 64 MiB; and
- least-squares slope no greater than 4 MiB per close cycle.

This is a bounded-growth smoke guard, not proof that process memory must return
to its initial value; WebKit, Readium, the allocator, and the OS retain caches.
Longer physical-device profiling remains a separate performance task.

The first 20-cycle device run produced:

| Platform                  | Final owned resources | High water (session/asset/publication/lease) | Post-warmup growth |     Post-warmup slope | Result  |
| ------------------------- | --------------------- | -------------------------------------------- | -----------------: | --------------------: | ------- |
| iPhone 17 Pro, iOS 26.5   | 0/0/0/0               | 1/1/1/1                                      |   24,084,480 bytes | 1,610,138 bytes/cycle | Bounded |
| Pixel 8, Android API 36.1 | 0/0/0/0               | 1/1/1/0                                      |    1,987,392 bytes | 1,035,407 bytes/cycle | Bounded |

Both runs completed 20 sessions with zero forced-release violations and no
crash. A final run after rebuilding, reinstalling, and applying the Android
fragment-identity fix independently remained inside the same limits:

| Platform                  | Final owned resources | High water (session/asset/publication/lease) | Post-warmup growth |     Post-warmup slope | Result  |
| ------------------------- | --------------------- | -------------------------------------------- | -----------------: | --------------------: | ------- |
| iPhone 17 Pro, iOS 26.5   | 0/0/0/0               | 1/1/1/1                                      |   24,592,384 bytes | 1,630,501 bytes/cycle | Bounded |
| Pixel 8, Android API 36.1 | 0/0/0/0               | 1/1/1/0                                      |   23,947,264 bytes | 1,271,230 bytes/cycle | Bounded |

The final source matrix, session tests, and destructive lifecycle suites also
pass on the same device classes. Raw reports and screenshots are retained
under `artifacts/LIB-021` in the development checkout; the program repository
carries the durable acceptance summary.

## Current boundary

- The stable view accepts `PublicationSource` objects; its internal serialized
  bridge prop is not public API.
- One simultaneous Android reader per `FragmentActivity` remains the qualified
  containment boundary.
- Remote sources remain disabled.
- Apple document-provider access is supported only when the consumer already
  supplies a usable security-scoped file URL; a `content:` URI is Android-only.
- Session diagnostics may change or become a debug-only capability before the
  public view contract freezes.
