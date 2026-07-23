# Reader progress semantics

Status: implemented for the 0.x SDK track.

## Outcome

Native EPUB Kit can enrich stable native location events with a deterministic
current navigation unit, chapter progress, overall publication progress,
position counts, and an honest precision marker. The calculation is shared
TypeScript over the generation-coherent navigation-unit snapshot introduced by
`getNavigationUnits()`; Swift and Kotlin do not contain a second chapter
algorithm.

Progress enrichment is opt-in. Set `chapterGranularity` on the mounted reader:

```tsx
<EpubReaderView
  chapterGranularity="top-level"
  source={{ kind: 'file', uri }}
  onLocationChange={(event) => {
    console.log(
      event.navigationUnit?.title,
      event.chapterProgress,
      event.overallProgress,
      event.position,
      event.totalPositions,
      event.precision
    );
  }}
/>
```

The property accepts the same `"top-level" | "leaf" | { depth: number }`
policy as `getNavigationUnits()`. Omitting it preserves the raw stable location
event contract and does not load chapter intervals.

## Canonical anchor

The visible start is the reading checkpoint. A location event uses
`visibleRange.start` when the pinned toolkit exposes a viewport and otherwise
uses `locator`. This prevents a viewport spanning a chapter boundary from
assigning the reader to the trailing chapter merely because its end is also
visible.

Membership is resolved in this order:

1. An exact normalized resource-and-fragment unit target.
2. A continuous total-progression interval.
3. A one-based canonical position interval.
4. A reading-order resource interval.

Unit starts are inclusive and ends are exclusive. An exact next-unit start
therefore owns a boundary. Overall publication end (`1`) belongs to the final
unit and reports final chapter progress `1`.

Resource paths are normalized with the same Unicode, percent-escape, query,
dot-segment, leading-slash, and fragment rules as navigation-unit derivation.
The snapshot instance and generation must match the location event; stale
snapshots return no enrichment.

## Values and precision

The calculation never advertises more precision than the native event or its
available interval boundaries.

Overall progress prefers, in order:

1. the visible anchor's canonical `locations.totalProgression`;
2. the native stable event's `overallProgress`;
3. `(position - 1) / totalPositions`; or
4. reading-order resource index plus resource progression.

The canonical anchor deliberately wins when a native viewport aggregate briefly
lags a completed programmatic jump.

Chapter progress is normalized within the selected unit's continuous interval
when its boundaries are unique. It otherwise uses a unique position interval,
then a resource interval. Distinct fragment chapters with the same coarse
position/resource boundary remain distinct by exact target, but report
resource precision and chapter progress `0` rather than inventing a range.

The returned marker is the least precise input used:

- `continuous` — a unique continuous viewport/progression interval;
- `position` — canonical position boundaries; or
- `resource` — only resource and optional in-resource progression are known.

`position` and `totalPositions` are included when available. Existing native
location fields, reason, identity, sequence, visible range, and canonical
locator are retained.

## Delivery and failure behavior

On each native `ready` generation, the React Native wrapper loads publication
metadata and every bounded position page, validates one coherent identity, and
derives the configured navigation-unit snapshot. `onReady` is not delayed.
Location events arriving during this short load are retained in native order
and emitted after enrichment.

The queue is bounded to 32 events. A paging failure, source/lifecycle race,
snapshot mismatch, or queue overflow flushes the queued events unchanged and
keeps delivering raw stable events for that generation. Derivation failures do
not drop events, reorder them, fabricate unit data, or reject a callback.
Changing granularity while ready creates a new coherent snapshot; disabling it
flushes any pending raw events. `getCurrentLocation()` follows the configured
policy and awaits the in-flight snapshot, while `getNavigationUnits()` can
reuse the matching snapshot.

## Headless helpers

The same public helpers work in React Native and the package's Node export:

```ts
const enriched = calculateReaderProgress(location, navigationSnapshot);
const safeEvent = enrichReaderLocationEvent(location, navigationSnapshot);
```

`calculateReaderProgress()` returns `null` for an empty or stale snapshot.
`enrichReaderLocationEvent()` returns a detached raw event in that case.

Controllers can track current rereading separately from furthest completion:

```ts
let state = createReaderProgressState(enriched);
state = updateReaderProgressState(state, laterEvent);

console.log(state.current, state.furthest, state.units);
```

`current` always follows the latest event and may move backward. `furthest` is
monotonic within one reader generation, and each visited unit retains its own
monotonic `furthestProgress`. A new native generation resets this ephemeral
state. Persistence, completion thresholds, timestamps, synchronization, and
cross-edition locator policy remain consumer-owned.

`isReaderProgressLocationEvent(location)` narrows the stable location callback
before handing an enriched event to the durable controller. Cross-generation
current/furthest merging, throttled writes, lifecycle flushes, and schema-v1
storage are defined in the [persistence/controller record](persistence.md).

## Reflow stability

`readerProgressAnchorsAreMateriallyStable(before, after)` is a small public
policy helper for viewport recreation and typography/preference reflow. It
requires the same navigation-unit ID and normalized resource. When both
checkpoints have positions, the default tolerance is one canonical position;
otherwise the overall-progression tolerance is `0.02`. Both tolerances can be
overridden with validated non-negative values.

This comparator does not declare two different chapters or resources stable,
and it does not overwrite a saved locator. It is intended for assertions and
controller policy around Readium's canonical anchors.

## Verification

The machine-readable `reader-progress-v1` contract pins start, midpoint,
chapter-boundary, position-precision, and final-publication values. Additional
tests cover visible-start ownership, resource-only fallbacks, duplicate coarse
fragment boundaries, stale generations, detached raw fallback, current versus
furthest state, generation reset, and reflow tolerances.

The example device flow verifies on both iOS and Android:

- enriched LTR and RTL events;
- honest platform precision;
- current and furthest controller output;
- same-unit stability after portrait/landscape recreation;
- stability after theme, font size, layout, margins, line height, alignment,
  and publisher-style changes; and
- chapter movement through explicit reading-order navigation.
