# Decoration groups and activation

LIB-061 adds a stable, headless decoration boundary backed by the pinned
Readium navigator on iOS and Android. Consumers own annotations, bookmarks,
search sessions, persistence, and product UI. The SDK owns validation,
group isolation, rendering, activation identity, and native geometry.

## Public API

Decorations are updated through the reader ref, never through a large React
prop:

```ts
await readerRef.current!.setDecorations('annotations', decorations);

await readerRef.current!.updateDecorations('annotations', [
  { type: 'add', decoration: newAnnotation },
  { type: 'update', decoration: editedAnnotation },
  { type: 'remove', id: deletedAnnotationId },
]);
```

`setDecorations()` replaces one complete group. Passing an empty array clears
that group. `updateDecorations()` applies an ordered add/update/remove delta to
one group. The whole input and resulting state are validated before the native
state changes, so a duplicate add, missing update/remove, invalid locator, or
limit violation cannot partially mutate the group.

Groups are independent. Replacing `search.results:v1` cannot clear
`annotations` or `transient.current`. The native host retains non-empty groups
when it recreates a navigator for the same source and reapplies them after the
new navigator is ready. A source replacement, explicit close, or invalid new
source clears all groups; persistence and restoration across publications
remain consumer responsibilities.

## Canonical record

```ts
interface ReaderDecoration {
  id: string;
  locator: Locator;
  style:
    | { type: 'highlight'; tint: string; isActive?: boolean }
    | { type: 'underline'; tint: string; isActive?: boolean }
    | { type: 'margin-icon'; asset: 'bookmark' | 'note'; tint?: string }
    | {
        type: 'custom';
        template: 'rounded-box-v1';
        config?: {
          tint?: string;
          borderRadius?: number;
          borderWidth?: number;
          fillOpacity?: number;
          isActive?: boolean;
        };
      };
  data?: JsonValue;
}
```

The locator is canonical Readium JSON and must resolve against the current
publication. Consumers should persist and replay the exact publication href,
including any package-root prefix such as `EPUB/`; guessing a relative href is
intentionally rejected by native Readium.

Colors accept only `#RRGGBB` or `#RRGGBBAA` and normalize to lowercase. The
margin assets and custom template are package-owned, fixed renderers. No public
field accepts HTML, CSS, JavaScript, selectors, URLs, remote images, local file
paths, or arbitrary asset names. The rounded-box bounds are:

- `borderRadius`: 0 through 12, default 4;
- `borderWidth`: 1 through 4, default 2;
- `fillOpacity`: 0 through 0.5, default 0.12;
- `isActive`: boolean, default false;
- `tint`: default `#e8c97a`.

## Bounds and identifiers

The same TypeScript, Swift, and Kotlin policy enforces:

- at most 32 non-empty groups per reader;
- at most 10,000 decorations in one group;
- at most 2,048 operations in one delta;
- group names up to 64 UTF-16 units matching
  `[A-Za-z][A-Za-z0-9._:-]*`;
- IDs up to 128 UTF-16 units matching `[A-Za-z0-9][A-Za-z0-9._:-]*`;
- at most 8,192 UTF-8 bytes of JSON `data` per decoration;
- unique IDs within each group.

Identifiers are NFC-normalized and trimmed before validation. `data` may be
any JSON value, including explicit nulls and arrays; it is never interpreted by
Readium or the SDK.

## Activation

Every non-empty group is observed once per native navigator. Activating a
rendered decoration emits the consumer's normalized canonical record rather
than trusting renderer-generated metadata:

```tsx
<EpubReaderView
  onDecorationPress={(event) => {
    console.log(event.group, event.decoration.id, event.decoration.data);
    console.log(event.geometry?.viewRect, event.geometry?.windowRect);
  }}
/>
```

The event contains `instanceId`, `generation`, monotonic `sequence`,
`platform`, `group`, `decoration`, and optional
`reader-view-and-window-v1` geometry. Geometry uses logical points on iOS and
density-independent pixels on Android, includes the viewport, and reports
visible clipping when a native rectangle or point can be resolved. Consumers
must anchor UI only when the needed rectangle is present.

## Verification

`decoration-policy-v1` executes the same normalization, safe-style, bound, and
atomic-delta cases in TypeScript, Swift, and Kotlin. The shared record suite
round-trips activation data and geometry in all three languages. Native builds
compile against Readium Swift 3.10.0 integration revision
`e43a052ded9fab70d7f0e8f6f19bd7e9edeac94f` and Readium Kotlin 3.1.2 without a
fork.

The generated annotation-stress EPUB has 2,048 stable, copyright-free text
anchors. The device flow proves three simultaneous groups, all four styles, an
ordered add/update/remove delta, activation data/geometry, and 2,000 real
Readium decorations followed by navigation to the final and first anchors.
On the qualified iPhone 17 Pro simulator, the final 2,000-decoration
bridge/native apply took 191 ms and the complete two-jump probe took 3,198 ms.
On the Pixel 8 API 36 emulator, apply took 274 ms and the complete probe took
937 ms. These
numbers are qualification baselines, not production-device performance
guarantees.
