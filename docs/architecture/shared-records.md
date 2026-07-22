# Shared record and error contract

LIB-020 established the stable JSON wire boundary shared by TypeScript, Swift,
and Kotlin. Later feature tasks extend the same versioned contract only after
matching implementations and fixtures exist in all three languages.

## Canonical records

`packages/testing/contracts/core-v1` is the executable contract source. Its
manifest and 15 golden cases cover:

- publication source;
- Readium locator;
- reader geometry;
- publication summary, links, contributors, positions, and capability shape;
- navigation unit;
- location event;
- selection, selection lifecycle, and selection action events;
- decoration;
- footnote event;
- reader link event;
- reader image activation event; and
- reader error.

TypeScript exports the domain interfaces plus parsing/serialization functions.
Swift and Kotlin expose matching JSON-backed record types and codecs inside the
native module. All three implementations validate known fields and retain the
original detached JSON object for structural encoding.

The public record names and enum strings are lower/camel case where they are
data (`readerLocationEvent`, `preference-change`, `continuous`) and upper snake
case only for stable error codes (`INVALID_LOCATOR`). Native enum case names do
not leak across the bridge.

## Locator ownership and forward compatibility

Readium Locator JSON is the only location format. A locator requires non-empty
`href` and `type`; known locations and text fields receive bounds/type
validation. Unknown fields at the locator root and within `locations` or
`text` are preserved recursively, including arrays, nested objects, and
explicit JSON nulls.

This is intentional. Readium platforms and future toolkit versions may add
location strategies such as CSS selectors or DOM ranges. The library must not
drop those extensions merely because the current TypeScript interface does not
name them. Storage adapters should persist the validated locator JSON together
with their own schema/version marker, never translate it to EPUB.js CFI or an
app-specific position format.

## JSON and nullability rules

Every public payload is detached, finite JSON:

- strings, booleans, null, finite numbers, arrays, and string-keyed objects;
- no `undefined`, functions, symbols, non-finite numbers, or cyclic objects;
- optional public fields are omitted rather than encoded as `null`;
- `Locator.title` accepts string or explicit null because upstream Readium JSON
  can contain that distinction; and
- arbitrary JSON extension/data/native-detail values may contain null.

Validation errors use `RecordValidationError`/native equivalents and include a
stable JSON-pointer-like path. These are developer boundary errors, not reader
runtime errors.

## Units and numerical bounds

The `core-v1` manifest fixes units explicitly:

| Value             | Contract                                                           |
| ----------------- | ------------------------------------------------------------------ |
| Geometry          | UIKit logical points on iOS; density-independent pixels on Android |
| Coordinate marker | `reader-view-and-window-v1`                                        |
| Progression       | Finite, closed `0...1`                                             |
| Position          | One-based positive safe integer                                    |
| Generation        | Zero-based non-negative safe integer                               |
| Sequence          | Zero-based non-negative safe integer                               |

Reader rectangles allow negative origins but require non-negative width and
height. Viewports require positive dimensions. Navigation-unit start/end
positions and progression bounds are checked; an exclusive end position must
be greater than its start when both exist.

Production selection snapshots require explicit rights and truncation state.
An active lifecycle event contains a snapshot; terminal `cleared` and
`dismissed` events contain `selection: null` and inactive handles. Selection
actions contain an active snapshot plus the configured action ID. See the
[production selection record](./selection.md) for text bounds, language
honesty, native ownership, and coordinate semantics.

## Error families and mapping

`ReaderError` is a JSON record with stable code, stable phase, human-readable
message, recoverability, and optional source/native diagnostic fields. Control
flow uses only the code, phase, and recoverability—not a native exception
string.

Stable codes are:

- source not found or permission denied;
- unsupported format, open failure, or protected publication;
- navigator creation or resource load failure;
- invalid locator, navigation failure, or search failure;
- reader not ready or destroyed; and
- native invariant violation.

Stable phases are `source`, `open`, `render`, `navigate`, `search`, `resource`,
and `close`.

Native mapping preserves known stable values. Qualification/toolkit aliases
map as follows:

| Native value                      | Stable value                      |
| --------------------------------- | --------------------------------- |
| `NAVIGATOR_RUNTIME_FAILED`        | `RESOURCE_LOAD_FAILED`            |
| `TYPOGRAPHY_CONFIGURATION_FAILED` | `TYPOGRAPHY_CONFIGURATION_FAILED` |
| Any unknown native code           | `NATIVE_INVARIANT_VIOLATION`      |
| Any unknown native phase          | `render`                          |

When a value is mapped, `nativeDetails` retains the original native code and
phase. Native details remain diagnostic and must be redacted before export.
The production view emits stable mapped code/phase values. LIB-022 projects
them into ordered `onError`/`onStateChange` callbacks and typed async command
rejections.

TypeScript's `NativeEpubKitError` wraps a validated record for rejected async
commands and serializes back to the unchanged record. It does not make native
stack text a control-flow API.

## Golden verification

The same 15 checked-in payloads are consumed directly by all languages:

- TypeScript validates, detaches, serializes, and checks invalid units, enums,
  nullability, unknown locator extensions, and stable error wrapping/mapping;
- Swift compiles the production `ios/SharedRecords.swift` into a standalone
  harness, decodes every envelope, compares the manifest, re-encodes each
  record, and checks rejection/mapping; and
- Android unit tests exercise the production Kotlin records/codecs against the
  identical files and manifest.

No generated or platform-specific fixture copy exists. A field rename, enum
change, unit change, lost null, or lost locator extension fails at least one
platform suite.

## Evolution rules

- Additive optional fields require matching implementation and golden updates
  in all three languages.
- Enum additions are API changes even when older consumers can ignore a field.
- Existing enum wire values, units, and nullability do not change within the
  contract version.
- Breaking changes require a new contract/storage version and an explicit
  Changeset after the repository has an authorized commit baseline.
- Unknown locator extensions remain forward-compatible and are never removed
  by a mapper.
- Remote source headers are accepted as source input but must never appear in
  events, diagnostics, logs, or persistence.

The contract is deliberately broader than the qualification bridge so later
features can implement behavior without inventing incompatible payloads.
