# Consumer-owned persistence and controller

LIB-062 adds a TypeScript-only, headless persistence boundary. The package
defines canonical records, validation, ordering, an adapter interface, a
deterministic in-memory reference adapter, and a per-publication controller. It
does not choose a database, create tables, access a user account, synchronize a
cloud service, or move app data through the native Readium bridge.

## Ownership boundary

The consumer owns durable storage and supplies a `ReaderPersistenceAdapter`.
An adapter can use SQLite, another local database, or a remote-capable store,
but it exchanges only package TypeScript records and canonical Readium Locator
JSON. Swift/Kotlin toolkit objects, CFIs, native view instances, file handles,
and product-specific models are not part of the interface.

One controller owns one `publicationId`. The ID is a stable consumer key, not
an EPUB path. It is trimmed, NFC-normalized, bounded to 256 UTF-16 units, and
uses the same conservative alphanumeric/period/underscore/colon/hyphen
vocabulary as other durable IDs.

## Durable records

`StoredReadingState` is schema version 1 and contains:

- the current `ReaderProgressCheckpoint`;
- a monotonic furthest checkpoint;
- current and furthest progress per stable navigation-unit ID;
- a canonical UTC `updatedAt` timestamp; and
- no native `instanceId` or generation, which are intentionally process-local.

`ReaderBookmark` contains a generated ID, publication ID, canonical locator,
optional navigation-unit/chapter/excerpt context, and canonical UTC creation
and update timestamps.

`ReaderAnnotation` contains the same durable identity and context plus bounded
selected text, optional note/language/direction, and the closed
`ReaderDecorationStyle` union. `readerAnnotationToDecoration()` and
`readerBookmarkToDecoration()` create safe package decorations with minimal
identity data for the `annotations` and bookmark groups.

Dates must use exact JavaScript UTC ISO form such as
`2026-07-13T16:00:00.000Z`; `updatedAt` cannot precede `createdAt`. All reads
are parsed into detached records. Unknown fields fail closed so accidental
schema drift is visible at the adapter boundary.

## Adapter contract

```ts
interface ReaderPersistenceAdapter {
  loadReadingState(publicationId: string): Promise<StoredReadingState | null>;
  saveReadingState(publicationId: string, state: StoredReadingState): Promise<void>;

  listBookmarks(publicationId: string): Promise<ReaderBookmark[]>;
  saveBookmark(bookmark: ReaderBookmark): Promise<void>;
  deleteBookmark(publicationId: string, bookmarkId: string): Promise<void>;

  listAnnotations(publicationId: string): Promise<ReaderAnnotation[]>;
  saveAnnotation(annotation: ReaderAnnotation): Promise<void>;
  deleteAnnotation(publicationId: string, annotationId: string): Promise<void>;

  loadPreferences(scope: PreferenceScope): Promise<ReaderPreferences | null>;
  savePreferences(scope: PreferenceScope, preferences: ReaderPreferences): Promise<void>;
}
```

Preference scope is the closed union `{ kind: 'global' }` or
`{ kind: 'publication', publicationId }`. The controller defaults to its own
publication scope; a supplied publication scope must match.

Adapters should transact reading state and any app-owned chapter table as one
write. The SDK serializes writes issued by one controller, while the app
adapter remains responsible for serialization across multiple controller
instances or other database clients.

## Controller setup

```ts
import { createReaderPersistenceController, isReaderProgressLocationEvent } from 'native-epub-kit';

const controller = createReaderPersistenceController({
  adapter: sqliteReaderPersistence,
  publicationId: book.slug,
  progressWriteIntervalMs: 5_000,
  onError(error) {
    reportReaderPersistenceIssue(error.issue);
  },
});

const restored = await controller.restore();
const initialLocator = restored.readingState?.current.locator;
```

`restore()` reads progress, bookmarks, annotations, and scoped preferences as
one atomic snapshot. No partial domain becomes visible. Adapter rejection
produces `adapter-read-failed`; malformed stored data produces
`invalid-persisted-data` with the exact read operation. Status becomes
`restore-error`, and a later `restore()` can retry.

`getSnapshot()` is detached and includes deterministic bookmark/annotation
ordering, pending-write count, dirty progress, a redaction-safe issue record,
and a revision suitable for `useSyncExternalStore`. `subscribe()` listeners
cannot change adapter ordering or outcomes; listener and error-reporter
exceptions are isolated.

## Progress throttling and flushes

Pass only navigation-unit-enriched `ReaderProgressLocationEvent` records to
`recordProgress()`. Current progress follows rereading in either direction;
furthest overall and per-unit values remain monotonic across controller and
process recreation.

High-frequency events update the in-memory snapshot immediately and schedule
one trailing write. The default interval is 5,000 ms and the supported range
is 250 through 60,000 ms. The timer is a throttle, not a debounce: continuous
scrolling cannot postpone storage indefinitely.

```ts
onLocationChange={(location) => {
  if (isReaderProgressLocationEvent(location)) controller.recordProgress(location);
}}
```

Use `handleAppStateChange('background' | 'inactive')` or explicit
`flush(reason)` calls for `reader-close`, `route-unmount`, and
`chapter-continuation`. A flush cancels the timer and drains progress that
arrives while a previous save is in flight. A failed progress write leaves the
latest in-memory state dirty so a later explicit flush retries it.

`destroy()` prevents new work, cancels the timer, flushes dirty progress, waits
for already accepted entity mutations, emits a final `destroyed` snapshot, and
then removes listeners. A flush failure is returned after destruction still
finishes, allowing the app to report the durability problem without retaining
an active controller.

## Optimistic entity rule

Bookmark, annotation, and preference mutations are optimistic:

1. validate the complete record before queueing;
2. expose the pending result immediately with `pendingWrites > 0`;
3. execute all adapter writes for the publication in acceptance order;
4. commit the operation after adapter success; or
5. remove only the failed operation and emit `adapter-write-failed`.

Later queued intent is never discarded when an earlier operation fails. For
example, if edit B fails while edit C for the same annotation is already
queued, the visible state remains C and C is still written. A failed delete
restores the previous committed record. Programmer input errors reject before
the queue and do not masquerade as database failures.

At most 2,048 entity mutations can be queued. Progress is separately coalesced
and does not consume this queue. Restored lists are bounded to 10,000 bookmarks
and 10,000 annotations, matching the SDK's deliberate bounded-memory posture.

## In-memory adapter

`InMemoryReaderPersistenceAdapter` is the normative reference for adapter
semantics and is suitable for examples, tests, previews, and intentionally
ephemeral readers. It supports optional seed state, clones every read/write,
isolates publications and preference scopes, returns deterministic order, and
uses idempotent deletes. It is not durable and is never selected implicitly;
production consumers must pass their own adapter.

## Error and privacy contract

`ReaderPersistenceError` retains the original error as local `cause` but its
public `issue` contains only code, operation, publication ID, optional record
ID, recovery flag, and monotonic sequence. Adapter error messages, database
paths, SQL, locators, selected text, and user notes are not copied into the
snapshot. Applications decide how to redact the stable publication/record IDs
for telemetry.

## Verification

The TypeScript suite covers strict records, timestamps, unknown fields,
ordering, list bounds, current/furthest progress, safe decoration conversion,
detached in-memory CRUD, atomic restore and retry, injected read and validation
failures, trailing throttling, every lifecycle flush reason, progress arriving
during an in-flight save, cross-domain write serialization, optimistic commit
and rollback, later-intent preservation, preference failure, dirty-progress
retry, process-destruction flush, and deterministic restoration in a new
controller.
