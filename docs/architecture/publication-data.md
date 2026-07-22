# Publication data and bounded positions

LIB-023 exposes publication metadata, table-of-contents links, reading order,
layout, capabilities, and Readium positions through the stable reader ref. The
records are detached from toolkit objects and never expose a Swift or Kotlin
controller to JavaScript.

## Public surface

Publication data is available after `onReady`:

```ts
interface EpubReaderViewRef {
  getPublication(): Promise<PublicationInfo>;
  getPositions(request?: PublicationPositionsRequest): Promise<PublicationPositionsPage>;
}
```

`PublicationInfo` contains the title, optional identifier and subtitle,
contributors, languages, normalized reading progression, complete hierarchical
TOC, reading order, `reflowable | fixed` layout, position count, and capability
report. It deliberately does not contain the position array.

Both results carry the native view `instanceId` and source `generation`.
Consumers fetching more than one page must reject or restart a chain if either
identity changes:

```ts
const publication = await readerRef.current!.getPublication();
const first = await readerRef.current!.getPositions();

if (first.instanceId !== publication.instanceId || first.generation !== publication.generation) {
  // The source changed between commands; restart from the new ready event.
}
```

The default position page is 128 locators and the hard maximum is 256. A larger
requested limit is clamped before it crosses the native bridge. Negative,
fractional, non-finite, or Android-`Int`-overflowing offsets and non-positive
limits reject locally with `RangeError`. Native code also clamps offsets to the
immutable snapshot end as a defensive boundary.

`nextOffset` exists only when another page remains. Every returned page is
validated for bounds, maximum length, a non-empty continuation, and exact
`nextOffset === offset + positions.length`. This prevents a malformed native
response from producing a silent infinite paging loop.

## Mapping rules

- Readium metadata is copied to JSON-compatible records. A blank or missing
  title becomes `Untitled publication` and adds `publication-title-missing`.
- A missing toolkit reading progression is normalized to `auto` on both
  platforms. Explicit `ltr`, `rtl`, `ttb`, and `btt` values are preserved.
- Contributor identifiers, sort keys, and roles are retained; roles and link
  relations are sorted to make diagnostics deterministic.
- TOC hierarchy is retained recursively, including fragment hrefs, sibling
  targets, duplicate targets, and incomplete coverage. The mapper does not
  flatten, repair, or discard publisher navigation.
- Reading-order links and arbitrary JSON-compatible link properties are
  detached from Readium values.
- Positions remain canonical Readium Locator JSON, including unknown locator
  extensions and explicit extension nulls.
- `rendition:layout=pre-paginated` maps to `layout: fixed`; all other EPUBs map
  to `reflowable` under the pinned toolkits.

Recursion is bounded at 256 levels as a corruption defense. Valid EPUB
navigation is expected to remain far below that limit.

## Diagnostics and capabilities

The mapper emits deterministic warnings without changing publication content:

| Warning                            | Meaning                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `publication-title-missing`        | Metadata had no usable title; fallback title used               |
| `toc-empty`                        | No publisher TOC is available                                   |
| `toc-duplicate-targets`            | Two or more TOC nodes resolve to the same resource and fragment |
| `toc-incomplete`                   | At least one reading-order resource has no TOC target           |
| `positions-unavailable`            | The toolkit returned no position service result                 |
| `fixed-layout-preferences-limited` | Reflow typography controls must be disabled                     |

Capabilities report selection, decoration, search, footnote, font,
fixed-layout, image activation, TOC, position-paging, and progress-precision
facts. Toolkit differences are
explicit: iOS currently reports continuous viewport precision, while Android
reports position precision when positions exist and resource precision
otherwise. Fixed-layout publications report custom fonts as unavailable.

Reflowable image activation is enabled on both platforms. The pinned Swift
target-element API also supports fixed layout. The pinned Kotlin 3.1.2 input
API does not expose a fixed-layout target, so Android fixed publications report
`images: false` plus `android-fixed-layout-image-activation-unsupported`.

`mappingDurationMilliseconds` is a numeric diagnostic extension in the
capability object. It covers position retrieval plus detached-record mapping,
not JavaScript rendering.

## Lifetime and performance

Each source generation creates one immutable native publication-data snapshot.
Position retrieval completes before the generation emits `ready`; consumers
therefore cannot observe a ready publication with missing metadata. Record
mapping runs in a detached Swift task or Kotlin `Dispatchers.Default`, and the
snapshot is invalidated on replacement, close, unmount, or disposal.

The full position array is never sent in a React prop, render pass, or event.
`getPublication()` returns only the count, and `getPositions()` bridges at most
256 locators on demand. Existing progress calculation reuses the same cached
position count instead of calling the toolkit service again.

The generated stress EPUB has 2,048 stable DOM targets and 297 real Readium
positions. The final Android API 36 device run mapped it in 19 ms and validated
the first 256-locator bridge page in 24 ms while the UI remained responsive.
The same bounded two-page chain and source-recovery flow passes on the iOS 26.5
simulator.

## Verification

`publication-data-v1/cases.json` is executed by TypeScript, production Swift,
and production Kotlin. It fixes default/maximum paging, empty and partial pages,
offset/limit defenses, and deterministic TOC warnings. Native mapper tests cover
metadata, nested and duplicate links, fixed layout, capabilities, progression
normalization, and paging.

The two-platform device matrix opens flat, nested/fragment/duplicate,
incomplete, large-position, and fixed-layout fixtures, then returns to a flat
publication to prove cache invalidation and recovery. Public TypeScript methods
are the only publication-data path used by the example.
