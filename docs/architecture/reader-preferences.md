# Reader preferences and rendering policy

LIB-025 freezes the first stable rendering-preference surface. Consumers pass
one controlled preference record; TypeScript, Swift, and Kotlin normalize the
same fields, apply an explicit publication-aware policy, and report requested
versus effective values without pretending that every EPUB layout supports
every control.

The package remains headless. It supplies rendering primitives and capability
results, while the application owns preference persistence, settings UI,
preview design, and any per-book/global precedence rules.

## Public surface

```tsx
const [preferences, setPreferences] = useState<ReaderPreferences>({
  theme: 'sepia',
  fontSize: 1.2,
  layout: 'scrolled',
});

<EpubReaderView
  ref={readerRef}
  source={{ kind: 'file', uri: localEpubUri }}
  preferences={preferences}
  onPreferencesChange={(status) => {
    // Render controls from status.support and status.applied.
  }}
/>;

const currentStatus = await readerRef.current?.getPreferences();
```

`ReaderPreferences` is a partial input. Before it reaches native code, the
facade rejects unknown fields, invalid types, non-finite numbers, unsupported
enum values, and numbers outside the frozen range. It then serializes a
complete `ResolvedReaderPreferences` record. Native code validates the same
closed record again instead of trusting JavaScript.

`ReaderPreferencesStatus` contains:

- `requested`: all nine normalized fields;
- `applied`: only fields that have an effect for the active publication;
- `support`: exactly one ordered result for every field, including an explicit
  reason when disabled;
- `warnings`: stable, non-localized policy markers;
- `publicationLayout`: `reflowable` or `fixed`; and
- the active native `instanceId` and `generation`.

The event is emitted once after each generation becomes ready and after every
accepted live preference record, including updates whose values are all
disabled by policy. `getPreferences()` returns the latest detached status for
the ready generation and follows the ordinary typed readiness/destruction
contract.

## Defaults, values, and ranges

| Preference           | Values/range                                                 | Default    |
| -------------------- | ------------------------------------------------------------ | ---------- |
| `theme`              | `light`, `dark`, `sepia`                                     | `light`    |
| `fontSize`           | finite `0.1...5` scale                                       | `1`        |
| `layout`             | `scrolled`, `paginated`                                      | `scrolled` |
| `spread`             | `auto`, `never`, `always`                                    | `auto`     |
| `pageMargins`        | finite `0...4` scale                                         | `1`        |
| `lineHeight`         | finite `1...2` scale                                         | `1.2`      |
| `textAlignment`      | `auto`, `start`, `end`, `left`, `right`, `center`, `justify` | `auto`     |
| `publisherStyles`    | boolean                                                      | `true`     |
| `readingProgression` | `auto`, `ltr`, `rtl`                                         | `auto`     |

These numeric bounds are the supported intersection of the pinned Readium
toolkits, not a promise to expose every upstream editor range. Values are not
silently clamped. Invalid input throws synchronously during render so a bad
settings record cannot become a platform-specific native fallback.

There is deliberately no `system` theme, arbitrary CSS, raw JavaScript,
unbounded font URL, or toolkit-native preference object in the public API.

## Publication-aware policy

| Active publication                       | Applied                                                                                          | Disabled                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Reflowable with `publisherStyles: true`  | theme, font size, layout, margins, publisher styles, reading progression                         | spread (`reflowable-layout`), line height and alignment (`publisher-styles`) |
| Reflowable with `publisherStyles: false` | theme, font size, layout, margins, line height, alignment, publisher styles, reading progression | spread (`reflowable-layout`)                                                 |
| Fixed layout                             | spread and reading progression                                                                   | all seven reflow/typography fields (`fixed-layout`)                          |

The warning markers are
`spread-fixed-layout-only`,
`publisher-styles-disable-advanced-text`, and
`fixed-layout-reflow-preferences-disabled`. A consumer should use `support`
for control state and warnings for diagnostics; warning prose is not intended
as user-facing copy.

The policy never rewrites `requested`. For example, a stored dark reflow
profile remains visible in `requested` while a fixed-layout publication
reports only spread/progression in `applied`. Moving to another reflowable
publication can therefore apply the original controlled record without the
adapter mutating application state.

## Native mapping

Both platforms map only policy-supported fields into Readium's typed EPUB
preferences:

- reflowable theme, font scale, scroll/pagination, margins, publisher styles,
  alignment, line height, and reading progression use native toolkit types;
- alignment and line height are omitted while publisher styles own them;
- fixed layout receives only spread and reading progression; and
- `auto` progression is represented by the toolkit's absent/default value.

Readium Kotlin 3.1.2 has an important representation detail: its
`EpubPreferences` constructor rejects the public `Spread.AUTO` sentinel and
uses `null` for automatic spread selection. The Android adapter therefore maps
consumer `spread: 'auto'` to absence, with a JVM regression test. `never` and
`always` map to their typed enum values. Readium Swift accepts its typed
automatic spread value. This is an adapter asymmetry with one symmetric public
meaning, not a consumer-visible platform difference.

When no stable `typographyProfile` is supplied,
`preferences.publisherStyles` is authoritative. A supplied profile owns that
single choice for reflowable content through its explicit `preserve`, `hybrid`,
or `override` mode, because the mode also determines whether the immutable
publication resource transform and native family declarations exist. All
other preference fields remain under this policy. Typography content
direction never changes `preferences.readingProgression`; see the
[typography profile record](typography.md).

## Atomic open and live updates

Source, optional initial locator, and the complete normalized preference
record cross the native boundary in one internal open envelope. A newly opened
navigator therefore never renders a JavaScript default generation before
receiving the intended initial preferences. If preferences change during an
open, that incomplete generation is cancelled and restarted with the new
atomic request.

When a ready reader receives a new record:

1. Native code resolves and emits the new publication-aware status.
2. If all changed fields are disabled by policy, no navigator mutation occurs.
3. Otherwise it waits for any active explicit navigation command to settle.
4. It captures the current canonical Readium locator.
5. It submits one complete native preferences object.
6. After Readium settles, it navigates back to the captured locator without
   animation.
7. It emits one immediate stable location with reason `preference-change`.

The status event means the update was validated and accepted. The
`preference-change` location is the rendering-settled checkpoint to persist or
use for a position-preservation assertion. Readium may subsequently report an
ordinary viewport observation such as `user-scroll`; that does not erase the
explicit checkpoint or change its canonical locator.

## Concurrency and lifecycle

Preference application is generation-scoped and last-write-wins. Every live
update receives a serial token. A replacement update cancels the old task, and
an old task's cleanup can clear only its own token. Source replacement,
unmount, close, and native disposal cancel the task and invalidate the serial.

Public navigation commands reject while a preference reanchor is active, and
preference application waits a bounded interval for an already-running
navigation command. Qualification progress observations are suppressed during
the mutation so the adapter emits a single explicit `preference-change`
checkpoint rather than exposing its intermediate anchor. Every async stage
rechecks view identity, publication identity, generation, navigator, ready
state, and cancellation before it can submit, navigate, or emit.

The live update reuses the LIB-024 locator/restore path; it does not invent a
second position model. Preferences are not part of source identity, so a ready
reader can update in place, while initial preferences remain part of the
atomic open request.

## Capability-aware UI pattern

The example app contains a replaceable settings overlay that:

- renders applied/unavailable counts from `ReaderPreferencesStatus`;
- disables font size for fixed layout and spread for reflowable layout;
- applies a complete dark, paginated, user-style profile in one update;
- toggles a second live font or spread change only when supported;
- compares the pre-update and `preference-change` positions; and
- verifies that `getPreferences()` and the latest event are coherent.

This is an integration pattern, not a generic UI package. Product applications
can build their own controls while relying on the same support records.

## Shared executable contract

`packages/testing/contracts/preferences-v1/cases.json` is consumed by
TypeScript, production Swift, and production Kotlin. It freezes all defaults,
ranges, fifteen valid/invalid normalization cases, and three publication policy
cases. The TypeScript native-status parser additionally proves that:

- support describes every field exactly once;
- applied fields exactly equal the supported set;
- applied values equal their requested values; and
- generation/layout/identity and disabled reasons are well formed.

Native tests cover the same policy plus Kotlin automatic-spread mapping. The
installed example's Maestro flow passes the reflowable and fixed matrices on
iPhone 17 Pro / iOS 26.5 and Pixel 8 / Android API 36, including live
pagination/theme/text changes, locator preservation, capability-disabled
controls, fixed spread updates, and command/event coherence.

## Ownership and remaining boundaries

- The library does not store preferences. The consuming application chooses
  global, language, per-book, and session precedence and passes the resolved
  controlled record.
- Changing preferences does not itself write the returned locator. The app
  persists canonical location events through its normal adapter.
- System appearance tracking, brightness, font-family selection, constrained
  script/language rules, and publisher preserve/hybrid/override profiles belong
  to the typography track.
- Columns, fixed-layout zoom, media-overlay settings, and arbitrary renderer
  customization are not silently represented by placeholders.
- Spread is a fixed-layout preference in this contract. Chapter swipe policy
  and chapter derivation remain separate navigation tasks.
