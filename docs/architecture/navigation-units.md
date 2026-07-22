# Navigation-unit derivation

LIB-030 adds deterministic chapter/progress boundaries without changing the
publisher's table of contents. The full hierarchical TOC remains available
through `getPublication()`. A separate navigation-unit snapshot chooses the
boundaries used by progress, next/previous chapter behavior, and consumer UI.

The derivation engine is shared TypeScript. Native code continues to own EPUB
opening, Readium metadata, canonical locators, and the immutable position list;
there is deliberately no second Swift or Kotlin chapter algorithm to drift.

## Public surface

Mounted readers expose a generation-coherent snapshot:

```ts
const topLevel = await readerRef.current!.getNavigationUnits('top-level');
const leaves = await readerRef.current!.getNavigationUnits('leaf');
const depthTwo = await readerRef.current!.getNavigationUnits({ depth: 2 });
```

The pure helper accepts detached publication records and is also available in
Node tooling:

```ts
const result = deriveNavigationUnits({
  tableOfContents: publication.tableOfContents,
  readingOrder: publication.readingOrder,
  positions,
  granularity: 'top-level',
});
```

`getNavigationUnits()` retrieves `PublicationInfo`, reads every position page
in batches of at most 256, and rejects with recoverable
`NATIVE_INVARIANT_VIOLATION/resource` if instance, generation, total, offset,
or continuation coherence changes. Invalid granularity fails locally before a
native command runs.

The ref returns `NavigationUnitSnapshot`, which adds `instanceId` and
`generation` to the pure `NavigationUnitDerivationResult`. Consumers must not
combine a snapshot with state from another reader generation.

## Granularity

`ChapterGranularity` has three policies:

| Value          | Selected publisher entries                                                         |
| -------------- | ---------------------------------------------------------------------------------- |
| `top-level`    | Every depth-zero TOC entry                                                         |
| `leaf`         | Every entry without children                                                       |
| `{ depth: n }` | Entries exactly at `n`; a branch that ends before `n` contributes its deepest leaf |

Depth is a safe integer from 0 through 256, matching the publication-link
corruption guard. Every policy selects an antichain: a selected TOC entry is
not also split by one of its selected descendants.

Deeper policies can begin after reading-order content owned by an unselected
container. Those leading resources become explicit fallback units, so every
reader location still belongs to an interval. The algorithm never silently
pretends that content before the first selected leaf is part of that leaf.

## HREF and locator normalization

Derivation uses two related identities:

- resource identity removes a query, leading slash, `.`/`..` path segments,
  and normalizes Unicode and percent-escape casing; and
- target identity appends the normalized fragment, if any.

Fragments are never discarded. A fragment-only child such as `#part` inherits
its parent TOC resource. Equivalent forms such as
`/OPS/text/./chapter.xhtml?cache=1#part%2D1` and
`OPS/text/chapter.xhtml#part-1` therefore resolve to one exact target.

For each selected link, the engine:

1. verifies that the normalized resource occurs in reading order;
2. searches positions in that resource for an exact normalized fragment;
3. otherwise uses the resource's first canonical position; and
4. when positions are unavailable, constructs a resource/fragment locator from
   the detached link without inventing a CFI or WebView offset.

The position array's immutable order is authoritative. Unit positions are
one-based array ordinals. If an embedded locator `locations.position` disagrees
with that ordinal, the result records `position-number-mismatch` and still uses
the coherent array order.

## Selection, ordering, and intervals

The algorithm is deterministic:

1. Clone and validate the detached TOC, reading order, and locators.
2. Flatten the TOC in publisher order while retaining numeric path, depth,
   parent, immediate children, and normalized target.
3. Select entries for the requested granularity.
4. Resolve each selected target to its reading-order resource and best position.
5. Collapse exact duplicate target boundaries.
6. Diagnose publisher-order inversions after duplicate collapse.
7. Insert required reading-order fallback units.
8. Sort by reading-order resource, position/progression when available, then
   publisher order as the deterministic tie-breaker.
9. Use the next unit's inclusive start as the current unit's exclusive end.
10. End the final positioned unit at `positions.length + 1` and total
    progression 1.

Start boundaries are inclusive; end boundaries are exclusive. The publication
end is the only closed terminal boundary. LIB-031 consumes these intervals to
calculate current unit and progress; LIB-030 does not yet mutate location
events or navigation behavior.

When two distinct fragment targets fall inside one coarse native position, both
units remain visible. The exact locators still differ, but a numeric position
or progression interval cannot honestly distinguish them. The corresponding
`unit-position-interval-empty` or `unit-progression-interval-empty` diagnostic
is emitted and that imprecise numeric end is omitted.

## Fallback units

A resource receives a `reading-order-fallback` unit when:

- no selected TOC target resolves at all;
- it occurs before the first resolved selected boundary; or
- no node anywhere in the publisher's full TOC references it.

Using the full TOC for the third rule is important. A resource referenced by a
child is not treated as missing merely because `top-level` granularity selected
its parent. Conversely, a genuinely incomplete TOC cannot make a reading-order
resource disappear from chapter/progress UI.

Fallback titles prefer the reading-order title, then a fragment or filename,
then `Section n`. They have depth zero and no synthetic TOC parent/children.

## Stable IDs and duplicate aliases

TOC unit IDs encode both the numeric publisher path and normalized target:

```text
toc:0.1:OPS%2Ftext%2Fchapter.xhtml%23part-1
```

Fallback IDs encode the reading-order path and normalized resource:

```text
reading-order-fallback:3:OPS%2Ftext%2Fappendix.xhtml
```

Titles are intentionally absent from identity, so localization or publisher
label corrections do not invalidate persisted unit IDs. Path is included in
addition to target; duplicate TOC nodes therefore have distinct conceptual IDs
even when they share a boundary.

The earliest selected node at an exact target is the primary unit. Later nodes
are returned as `NavigationUnitAlias` records with their own ID, title, depth,
and the primary `unitId`. Aliases remain available for display/search without
creating zero-length progress chapters. Order diagnostics run after this
collapse, so an alias does not produce a false out-of-order warning.

`parentId` and `childIds` retain conceptual full-TOC IDs. A selected leaf can
therefore name an unselected parent; consumers that need the publisher tree
should continue rendering `PublicationInfo.tableOfContents` rather than
assuming the selected unit array is a closed hierarchy.

## Bounded diagnostics

`NavigationUnitDerivationDiagnostics` returns exact aggregate counts and the
first 512 deterministic issue records. `issueCount` includes every issue and
`issuesTruncated` reports how many details were omitted. Issue records contain
only a stable code plus an applicable normalized href, TOC ID, or unit ID.

Codes are frozen for this slice:

| Code                               | Meaning                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `positions-unavailable`            | No canonical positions were supplied                           |
| `position-number-mismatch`         | Locator position disagreed with immutable array ordinal        |
| `reading-order-empty`              | Publication exposes no linear reading order                    |
| `reading-order-duplicate-resource` | Reading order repeated a normalized resource                   |
| `reading-order-fallback`           | A fallback unit was inserted                                   |
| `toc-empty`                        | Publisher TOC is absent                                        |
| `toc-entry-out-of-order`           | A unique selected entry moves backward in publication order    |
| `toc-entry-unresolved`             | Selected target is outside reading order                       |
| `toc-entry-untitled`               | Selected TOC node required a deterministic title fallback      |
| `toc-duplicate-boundary`           | Exact target became an alias of an earlier unit                |
| `unit-position-interval-empty`     | Distinct locator boundaries share one coarse position          |
| `unit-progression-interval-empty`  | Distinct locator boundaries share one coarse total progression |

Diagnostics describe publisher/toolkit precision; they do not mutate the
original TOC, discard labels, or claim that every TOC node is a chapter.

## Verification

`navigation-units-v1/cases.json` covers:

- top-level and leaf hierarchy policies;
- explicit depth and shallower-branch fallback;
- exact duplicate fragments and retained aliases;
- percent/query/dot-segment normalization;
- incomplete and empty TOCs;
- unresolved and out-of-order entries;
- missing and noncanonical positions;
- distinct fragment boundaries with coarse numeric intervals; and
- bounded diagnostic truncation.

Additional tests load a 300-position snapshot through two pages, reject a stale
generation, prove invalid options are fail-fast, validate every resulting
`NavigationUnit`, preserve input immutability, and keep IDs stable across title
changes.

The example's `navigation-units.yaml` flow calls only the stable public ref on
both native platforms. It derives top-level, leaf, and depth-one units from the
six-node nested fixture, then derives a one-unit snapshot over the real
297-position stress EPUB to prove two-page native snapshot loading.
