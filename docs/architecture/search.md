# Native search sessions

LIB-080 adds a stable, headless search boundary over the pinned Readium Swift
and Kotlin search services. The SDK owns request validation, native iterator
lifetime, bounded paging, canonical result mapping, and generation safety. The
consumer owns query UI, result-list state, decoration styling, navigation
history presentation, and persistence.

## Public API

Search is command-driven through the mounted reader ref:

```ts
const session = await readerRef.current.search('faith', {
  caseSensitive: false,
  diacriticSensitive: false,
  language: 'en',
  pageSize: 50,
});

let cursor: string | undefined = session.nextCursor;
try {
  while (cursor !== undefined) {
    const page = await readerRef.current.getSearchPage(session.id, cursor);
    appendResults(page.results);
    cursor = page.nextCursor;
  }
} finally {
  await readerRef.current.cancelSearch(session.id);
}
```

The stable records are `ReaderSearchOptions`, `ReaderSearchSession`,
`ReaderSearchPage`, `ReaderSearchResult`, `ReaderSearchExcerpt`, and
`ReaderSearchNavigationUnitContext`. The shorter `SearchOptions`,
`SearchSession`, `SearchPage`, and `SearchResult` names are type aliases only.

## Request contract

Queries are NFC-normalized, trimmed, and rejected when empty or longer than
256 UTF-16 units. The only options supported consistently by both pinned
toolkits are:

| Option               | Default | Contract                                    |
| -------------------- | ------- | ------------------------------------------- |
| `caseSensitive`      | `false` | Boolean                                     |
| `diacriticSensitive` | `false` | Boolean                                     |
| `language`           | absent  | Bounded BCP 47 tag, at most 64 UTF-16 units |
| `pageSize`           | `50`    | Integer from 1 through 100                  |

Unknown options reject atomically. In particular, the public boundary does
not expose regular expressions, toolkit-specific flags, raw search service
configuration, or a way to inject a custom search algorithm.

`search-policy-v1/cases.json` fixes the same defaults, bounds, normalization,
BCP 47 admission, bidi excerpt behavior, and decoration-group names in
TypeScript, Swift, and Kotlin.

## Session and cursor semantics

One mounted reader generation has at most one active native search iterator.
Starting a new query cancels and releases the previous iterator before the new
session is created. Source replacement, close, unmount, and native disposal do
the same. A session carries the exact native `instanceId` and source
`generation`; work cannot migrate to a replacement publication.

Paging is forward-only. The session's `nextCursor` obtains the first page, and
each successful page supplies the only cursor that can obtain the following
page. A cursor is consumed exactly once, including the terminal cursor. A
replayed, skipped, stale, malformed, or concurrent cursor rejects. Only one
page request may be in flight for a session.

`cancelSearch(sessionId)` is idempotent for any syntactically valid identifier.
It succeeds if the session already ended, was replaced, or was previously
cancelled. Invalid identifier syntax still rejects at the public boundary.

## Bounded results

The bridge emits at most 100 results in one page and at most 2,000 results in
one session. No consumer-facing page or retained coordinator buffer can grow
beyond those bounds. `loadedResultCount` is the cumulative emitted count.
`truncated: true` means the 2,000-result ceiling was reached and additional
publication matches may exist; consumers should present that state rather
than imply a complete count.

Each result contains:

- a canonical Readium `Locator`, with its text fields reduced to the same
  bounded excerpt returned alongside it;
- `before`, `highlight`, and `after` excerpt segments that preserve logical
  Unicode/bidi order;
- a zero-based session index and a decoration-safe ID such as
  `search-result:42`;
- a resource title when Readium supplies one; and
- derived navigation-unit ID, index, and precision when the reader has a
  matching chapter-boundary configuration.

Excerpt context is limited to 256 UTF-16 units on each side, the highlighted
text to 256, and the resource title to 512. Truncation never splits a Unicode
scalar. The excerpt's own `truncated` flag is independent of the session's
result-ceiling flag.

## Native parity and completeness

Both adapters delegate text matching to their official Readium search service
and normalize its locator output. The pinned engines differ when a reading-
order resource is missing: both can skip it and still return an apparently
successful but incomplete result set. Before creating an iterator, the SDK
therefore verifies that every declared reading-order resource is available.
An unavailable resource fails the whole search. A later native read or
extraction error also fails the session.

This is intentionally a completeness policy, not EPUB repair. The SDK does
not remove broken spine entries, index alternate content, fetch external
resources, or return partial results as complete.

Unsupported search, invalid requests, replaced/cancelled sessions, consumed
cursors, concurrent page requests, and native read failures reject with the
stable recoverable error code `SEARCH_FAILED` and phase `search`. The message
distinguishes the reason for diagnostics, but consumers should branch on the
stable code and phase rather than parse text.

## Decorations and navigation

The session publishes two fixed, independent group names:

- `search.results:v1` for all loaded results; and
- `search.current:v1` for the currently selected result.

Search does not mutate decorations automatically. A consumer can turn result
locators into `ReaderDecoration` values and use `setDecorations()` or
`updateDecorations()` with those groups. Because the groups are ordinary
isolated decoration groups, they cannot clear annotations, bookmarks, or each
other.

Navigation is likewise composed from existing stable commands. Call
`goTo(result.locator)` to navigate and use `goBack()` for the app's Back to
Previous Location affordance. The search coordinator neither changes jump
history defaults nor persists a query.

## Product responsibilities

The core package intentionally does not provide search-sheet UI, debouncing,
recent queries, result virtualization, analytics, or durable storage. A
consumer should cancel on query replacement, retain only the pages needed by
its UI, virtualize large result lists, clear its two search decoration groups
when dismissing the flow, and display empty, truncated, unsupported, failed,
and cancelled states explicitly.

## Qualification

The installed example runs one public-API matrix on both platforms:

1. an empty result with terminal and consumed-cursor replay rejection;
2. Urdu search with a BCP 47 override and bounded logical excerpts;
3. 2,048 matches capped at 2,000 across twenty 100-result pages, with explicit
   truncation, isolated result/current/annotation groups, navigation/back,
   replacement cancellation, stale-session rejection, and idempotent cleanup;
4. a deliberately invalid EPUB whose missing later reading-order resource
   maps to `SEARCH_FAILED/search` instead of silent partial success.

The diagnostic capability reports search as `stable` and enabled for the
qualified EPUB adapters.
