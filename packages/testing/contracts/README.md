# Shared contract fixtures

## Stable core-v1 records

`core-v1/` is the canonical cross-language wire contract introduced by
LIB-020. Its manifest fixes record names, enum wire values, coordinate and
progress units, and nullability. Eleven JSON-backed golden records cover
sources, rich Readium locators, geometry, publication metadata, navigation
units, location events, selections, decorations, footnotes, reader links, and
stable errors.

The same files are validated and structurally round-tripped by the public
TypeScript codecs, the production Swift records, and the production Kotlin
records. Locator objects retain unknown nested JSON and explicit extension
nulls. Optional public fields are omitted rather than encoded as `null`, except
for the documented nullable Readium locator title and arbitrary JSON extension
values.

Run the stable record suites with:

```sh
pnpm --filter native-epub-kit test
pnpm --filter @native-epub-kit/testing records:test:swift
./apps/example/android/gradlew -p apps/example/android \
  :native-epub-kit:testDebugUnitTest \
  --tests com.bilal.nativeepubkit.SharedRecordsTest
```

## Production publication-session lifecycle

`publication-session-v1/cases.json` is the shared state-transition contract
for the one-shot Swift and Kotlin production sessions. It covers a successful
open, failures during source resolution, retrieval, and publication opening,
and an early close. The native harnesses also exercise resource-ledger cleanup
and bounded post-warmup memory calculations with synthetic samples.

Run it with:

```sh
pnpm --filter @native-epub-kit/testing lifecycle:test:swift
./apps/example/android/gradlew -p apps/example/android \
  :native-epub-kit:testDebugUnitTest \
  --tests com.bilal.nativeepubkit.PublicationSessionLifecycleTest
```

## Stable reader view protocol

`reader-api-v1/cases.json` freezes command readiness, per-generation public
event sequencing, stale-generation suppression, and the 120 ms user-scroll
location throttle. TypeScript, Swift, and Kotlin execute the same cases. The
protocol leaves source/session ownership to `publication-session-v1` and
feature-specific commands to their later contracts.

Run it through the package, Swift lifecycle, and Android unit suites.

## Navigation and locator restore

`navigation-v1/cases.json` fixes the closed publication-progression range, the
one-based 32-bit bridge-safe position range, direct-jump versus logical-boundary
outcomes, and the first stable location reason for ordinary, restored, and
preference-driven opens. TypeScript validates the public numeric boundary;
production Swift and Kotlin additionally execute outcome and restore-reason
cases. Device flows cover real Readium locator settlement and Android's
vertical-scroll logical-navigation fallback.

Run it through the package, Swift lifecycle, and Android unit suites.

## Reader preferences and rendering policy

`preferences-v1/cases.json` freezes nine normalized preference fields, their
defaults and shared toolkit ranges, fifteen valid/invalid input cases, and the
reflowable-publisher, reflowable-user-style, and fixed-layout policy matrices.
TypeScript, production Swift, and production Kotlin consume the same file.

The native status contract describes every field exactly once, reports only
supported fields as applied, and preserves requested values even when a
publication disables them. Android separately proves that consumer spread
`auto` maps to an absent Readium preference because Kotlin 3.1.2 rejects the
toolkit's `Spread.AUTO` sentinel in `EpubPreferences`.

Run it through the package, Swift lifecycle, and Android unit suites. The
installed `apps/example/maestro/preferences.yaml` flow adds live renderer,
locator-preservation, ref/event coherence, and capability-aware UI coverage on
both platforms.

## Publication data and position paging

`publication-data-v1/cases.json` fixes the 128-position default page, the
256-position bridge maximum, defensive offset/limit behavior, and deterministic
warnings for flat, nested, fragment, duplicate, incomplete, empty, and
fixed-layout publication navigation. TypeScript, Swift, and Kotlin execute the
same cases; native mapper tests and device EPUBs cover toolkit integration.

Run it through the package, Swift lifecycle, and Android unit suites.

## Support diagnostics and redaction

`diagnostics-v1/cases.json` freezes the schema version, 15 feature names and
stages, warning bound, exact native toolkit identities, and `support-v1`
redaction deny-list. Its three cases cover valid iOS reflowable fonts, an
Android fixed-layout publication without a manifest, and an invalid Android
manifest.

TypeScript, production Swift, and production Kotlin all derive capability and
warning output from the same inputs. The suites reject or detect source/header,
publication identity/content, locator/selection, native-detail/stack, and local
path leakage. The installed `apps/example/maestro/diagnostics.yaml` flow adds
real native-command, font-manifest, reflowable/fixed capability, and issue-view
coverage on both platforms.

## Native font manifest and family grouping

`font-manifest-v1/cases.json` freezes schema version 1, the 64-face bound,
platform-specific generated paths, atomic rejection, and deterministic
family/face order. Its eight cases cover no manifest, iOS multiple families,
Android multiple faces, unknown fields, duplicate tuples, wrong platform paths,
missing assets, and invalid face fields.

TypeScript, production Swift, and production Kotlin execute the same cases.
Native tests add a generated 65-face rejection case. Installed typography and
diagnostic flows prove that two configured weights are grouped into one
Readium family, both CSS descriptors load, and reports expose only `valid 2/1`
without names or paths.

## Stable typography profile

`typography-profile-v1/cases.json` freezes the 32-rule and eight-family bounds,
atomic normalization, installed/generic family admission, safe
language/direction/class targets, bounded direction/line-height/weight
declarations, closed surface/rule colors, and deterministic
preserve/hybrid/override CSS semantics. Its eleven cases include absence,
three valid modes, escaping and normalization, and rejection of unknown
fields, malformed colors, selector-like classes, unavailable or duplicate
families, empty rules, and invalid numeric declarations.

TypeScript, production Swift, and production Kotlin execute the same cases.
Native suites also cover resource-type filtering, idempotent injection,
UTF-8/UTF-16 byte order and BOM preservation, unsupported-encoding fail-safe
behavior, and mixed English/Arabic/Urdu graphemes. The production adapters
exclude fixed-layout publications. Installed typography and selection journeys
add locator, progression, native-handle, coordinate, and rotation proof.

## Production footnote and link policy

`footnote-link-policy-v1/cases.json` freezes semantic-only defaults,
`navigate` and `semantic-and-heuristic` modes, conservative false-positive
avoidance, data-only consumer rules, HTTP/HTTPS and custom scheme admission,
and intercepted/blocked dispositions. TypeScript, Swift, and Kotlin execute the
same 15 cases. Native suites add bounded same-resource, cross-resource, and
multi-paragraph heuristic extraction; installed journeys prove event-before-
navigation behavior, 350 ms locator stability, consumer downgrade, ordinary
navigation, and external/unsupported policy.

## Navigation-unit derivation

`navigation-units-v1/cases.json` is the shared TypeScript derivation contract.
The native platforms supply the same stable publication and paged-position
records, while one package algorithm selects top-level, leaf, or explicit-depth
boundaries. Its six cases cover nested and shallow branches, duplicate
fragments and aliases, incomplete/empty TOCs, reading-order fallbacks,
unresolved/out-of-order links, URI normalization, unavailable positions, and
coarse same-position fragment intervals.

The package suite adds stable-ID, input-detachment, diagnostic-bound,
300-position paging, and stale-generation tests. The installed example's
`navigation-units.yaml` flow proves the public ref against real Readium data on
both platforms.

## Navigation-unit boundaries and history

`navigation-boundaries-v1/cases.json` freezes the 64-entry ephemeral history
bound and six exact membership cases: continuous intervals, one-based position
intervals, exact same-resource fragments, preferred-unit resource fallback,
and publication-end inclusivity. Production TypeScript, Swift, and Kotlin all
execute this file.

The package suite adds precision downgrade, previous/current/next context,
event parsing and stale rejection, immutable history deduplication, oldest-first
eviction, pop, and clear. The installed example's
`navigation-boundaries.yaml` flow proves native rollback plus TOC jump/back on
both platforms.

## Native search policy

`search-policy-v1/cases.json` freezes query NFC/trim behavior, the common
case/diacritic/language/page-size options, all bridge bounds, logical bidi
excerpt truncation, and the two isolated decoration-group names. TypeScript,
Swift, and Kotlin execute the same cases.

The installed example's `search-sessions.yaml` flow adds real Readium empty and
Urdu queries, forward-only cursor replay rejection, a 2,048-match fixture
capped at 2,000 across twenty pages, decoration isolation, result
navigation/back, replacement cancellation, stale-session rejection,
idempotent cleanup, and explicit failure for a missing reading-order resource
on both native platforms.

## Qualification fixtures

The JSON files in `qualification-v0/cases/` are loaded directly by TypeScript,
Swift, and Kotlin tests. There are no copied platform-specific versions. This
makes field omission, spelling, numeric units, Unicode handling, and explicit
`null` behavior observable before the public bridge contract is frozen.

The qualification-v0 envelope is test infrastructure, not a public API. The
domain payloads are representative seeds for LIB-020, where the stable shared
records and event schemas will be specified.

Every case contains:

- `schemaVersion`, `caseId`, and `recordType` identity fields;
- an arbitrary JSON `payload`;
- JSON pointers that every language must preserve; and
- JSON pointers whose values must remain explicitly `null`.

Run the loaders with:

```sh
pnpm --filter @native-epub-kit/testing test
pnpm --filter @native-epub-kit/testing contracts:test:swift
./apps/example/android/gradlew -p apps/example/android \
  :native-epub-kit:testDebugUnitTest
```

The Android command requires the example app's generated native project; run
`pnpm --filter native-epub-kit-example exec expo prebuild --platform android
--no-install` first when it is absent.
