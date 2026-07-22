# Publication open, close, and error qualification

This is the historical LIB-012 publication lifecycle spike record. LIB-021 has
replaced its resource ownership and source-resolution implementation with the
[production publication session](./production-publication-session.md).
Its scalar source and state-event shape are superseded by the
[stable native view API](./stable-native-view-api.md).

## State and event model

Each native view instance owns a lifecycle gate with the following states:

```text
idle
  -> opening
  -> waitingForHost (optional)
  -> ready
  -> closing
  -> idle | unmounted

opening | waitingForHost -> error
ready -> error (future render failures)
error -> idle | opening | closing | unmounted
```

Every source assignment invalidates older asynchronous work with a monotonic
generation. Generations are scoped to one native view, so qualification events
also carry a random `instanceId`. The event gate rejects:

- completion from an older generation;
- duplicate state emissions for the same instance and generation;
- `ready` after an error; and
- backward or otherwise invalid same-generation transitions.

The same five transition contracts execute in TypeScript, Kotlin/JUnit, and a
Swift harness that compiles the production Swift state machine. Device tests
independently assert one `ready` or `error` emission for every instance and
generation.

## Qualified source boundary

Only absolute local `file:` URIs ending in `.epub` are qualified. The native
preflight performs these checks before Readium receives the source:

1. URI is syntactically valid, absolute, and local;
2. the path exists and is a regular file;
3. the process can open the file for reading; and
4. the extension is EPUB.

Remote URLs, content/document-provider URIs, and other publication formats are
explicitly unsupported during qualification. This is narrower than Readium's
engine capability by design and prevents an accidental public promise before
source security, headers, caching, and download ownership are designed.

## Provisional error mapping

Errors contain a code, phase, safe message, and recoverability flag. Paths,
remote headers, native stack traces, and raw Readium diagnostics are not sent
through the event payload.

| Source/result                                               | Code                         | Phase    | Recoverable |
| ----------------------------------------------------------- | ---------------------------- | -------- | ----------- |
| Missing local EPUB                                          | `SOURCE_NOT_FOUND`           | `source` | Yes         |
| Existing but unreadable EPUB                                | `SOURCE_PERMISSION_DENIED`   | `source` | Yes         |
| Invalid URI, non-file URI, directory, or non-EPUB extension | `UNSUPPORTED_FORMAT`         | `source` | Yes         |
| Readable `.epub` whose archive/publication cannot be parsed | `PUBLICATION_OPEN_FAILED`    | `open`   | Yes         |
| Navigator construction failure                              | `NAVIGATOR_CREATION_FAILED`  | `render` | Yes         |
| Native host attachment invariant                            | `NATIVE_INVARIANT_VIOLATION` | `render` | No          |

Readium performs format sniffing while retrieving an asset. Consequently, a
corrupt but readable `.epub` may fail before `PublicationOpener` is called. The
wrapper maps both structural retrieval failure and opener failure to
`PUBLICATION_OPEN_FAILED`; native implementation phases do not leak into the
consumer contract.

## Resource ownership and cancellation

On iOS, a stale or failed retrieved `Asset` is closed explicitly. A stale,
failed, replaced, unmounted, or deinitialized `Publication` is also closed
explicitly. Teardown clears the reference immediately, making subsequent
teardown a no-op.

On Android, transient asset/publication references remain under a coroutine
cleanup guard until ownership transfers to the pending session. Cancellation
or an unexpected exception closes those transient resources. Pending and
active publications are mutually exclusive, fragment removal is synchronous,
and teardown clears references after closing them.

Setting the source to `null` keeps the Expo view mounted, emits `closing` when
work is active, releases the navigator/publication, and terminates in `idle`.
Unmount terminates in `unmounted`. Both paths are idempotent. A newer source may
begin immediately; stale completion cannot attach or emit.

## Runtime proof

The shared device flow passed on iPhone 17 Pro / iOS 26.5 and Pixel 8 / Android
API 36.1 with all of the following in one run:

- valid open;
- missing, corrupt, unsupported, and real POSIX mode-000 unreadable sources;
- recovery to a valid publication after every error;
- explicit close to unambiguous `idle`;
- immediate corrupt-to-valid replacement to cancel stale work; and
- five additional close/reopen cycles.

Every terminal state reported zero or one navigator as appropriate and exactly
one event for its native instance/generation. The original destructive
lifecycle suite also passed afterward on both platforms. JUnit reports,
failure-history reports, command traces, and state screenshots live under
`artifacts/LIB-012` in the development repository.
