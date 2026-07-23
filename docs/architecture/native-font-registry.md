# Native font manifest and Readium registry

Status: implemented for the 0.x SDK track.

## Outcome

The iOS and Android adapters now consume the config plugin's schema-version-1
font manifest through the same fail-closed policy, group every weight/style
face belonging to a family, and submit one family declaration with all of its
faces to the exact Readium navigator API.

This layer owns manifest admission and native Readium registration. The config
plugin owns source-file validation and native project generation. The stable
[typography-profile layer](typography.md) owns language/direction/class
selection, family fallback, and publisher preserve/hybrid/override policy.

## Atomic native admission

Both adapters treat a manifest as one atomic registry snapshot. A present
manifest is accepted only when:

- its root contains exactly `schemaVersion` and `fonts`;
- `schemaVersion` is exactly `1`;
- it declares 1 through 64 faces;
- every face contains exactly `family`, `file`, `path`, `style`, and `weight`;
- the family is trimmed NFC, contains no control characters, and is at most
  128 UTF-16 code units;
- the generated filename has the package-reserved
  `NativeEpubKit-<declaration-index>-<safe-stem>.ttf|otf` form;
- the path matches the platform's generated location exactly;
- the bundled/asset file is readable;
- style is `normal` or `italic`;
- weight is an integer in `1...1000`; and
- no family repeats the same `(weight, style)` tuple.

Unknown fields, a wrong platform path, index reordering, a missing asset,
duplicate tuple, invalid scalar, empty list, oversized list, malformed JSON, or
unsupported schema rejects the whole snapshot. No valid-looking subset is
registered. A partially installed family can silently select the wrong face
and is harder to diagnose than an explicit invalid manifest.

An absent manifest is `not-configured`, not invalid. The config plugin normally
removes the manifest when no faces are configured.

## Deterministic family grouping

Accepted faces retain manifest order. Families retain the position of their
first face, and faces retain declaration order inside the family. For example:

```text
Reader Serif 400 normal
Reader Serif 700 normal
Reader Serif 400 italic
Urdu Nastaliq 400 normal
```

becomes two native family declarations, with three faces in `Reader Serif` and
one in `Urdu Nastaliq`. It does not become four competing declarations for the
same family.

On iOS, the adapter builds one Readium `CSSFontFamilyDeclaration` per family
and one `CSSFontFace` per manifest face. Standard 100-step weights map to
Readium's named CSS weights; other admitted integers use an exact one-value
variable range. Each face uses a bundle `FileURL`, its exact normal/italic
style, and `preload: false`.

On Android, the adapter adds the package-owned asset path to
`EpubNavigatorFragment.Configuration.servedAssets`, calls
`addFontFamilyDeclaration` once per family, and calls `addFontFace` for every
face with its exact asset source, style, and one-value weight range.

Registration occurs while constructing the Readium navigator configuration;
consumers do not receive a raw font URL, stylesheet, JavaScript, or native
configuration escape hatch.

## Runtime selection boundary

The stable profile can reference any atomically admitted family and order up
to eight installed/generic fallbacks in a default or targeted rule. Native
validation rejects an unavailable family before navigator creation. All
configured faces for each selected family remain grouped, so WebView/CSS
weight and style selection resolve through the declaration rather than a
second ad hoc font loader. Fixed-layout publications do not register profile
families or install a resource transform.

Consumers should configure a font file whose internal face metadata matches
the declared weight/style. The registry verifies the delivery contract and CSS
descriptor, not the glyph designer's intended weight or script coverage.

## Redaction-safe diagnostics

`getDiagnostics()` exposes the admitted runtime registry without leaking font
names or paths:

| Status           | Counts | Meaning                                                        |
| ---------------- | ------ | -------------------------------------------------------------- |
| `not-configured` | `0/0`  | no native manifest is present                                  |
| `valid`          | `N/M`  | all `N` faces in `M` families were admitted for Readium config |
| `invalid`        | `0/0`  | a present snapshot failed atomically; no face was admitted     |

For a reflowable publication, the `custom-fonts` capability is enabled only
when this status is `valid`. Fixed-layout publications keep the manifest status
but disable active custom-font replacement. Invalid manifests add only the
bounded `font-manifest-invalid` warning marker; reports never include family,
file, asset path, source path, or font bytes.

## Shared executable contract

`packages/testing/contracts/font-manifest-v1/cases.json` is executed by the
TypeScript reference policy and the production Swift/Kotlin policies. It pins:

- schema and 64-face bounds;
- absent-manifest semantics;
- iOS and Android path forms;
- multiple faces in one family;
- multiple families and deterministic order;
- duplicate tuple rejection;
- unknown-field rejection;
- platform-path rejection;
- missing-asset rejection; and
- atomic invalid results.

Native unit tests add an oversized 65-face case. The Swift lifecycle harness and
Android unit suite execute the same eight frozen cases.

## Native build and device qualification

The example config declares two qualification faces, weights 400 and 700, under
one family. Both entries intentionally use the same licensed fixture bytes so
the test isolates descriptor grouping and delivery; it does not claim the
regular font file visually contains a distinct bold design.

Debug and Release app builds pass on both platforms. Installed device journeys
then prove:

- runtime diagnostics report `fonts valid 2/1`;
- the reflowable custom-font capability is enabled;
- the fixed-layout capability is disabled without losing manifest health;
- `document.fonts.check` succeeds for both 400 and 700 declarations;
- preserve/hybrid/override journeys retain stable locators and selection; and
- Urdu shaping remains visibly correct across rotation.

## Boundaries and upgrade notes

- The registry never downloads, discovers, or scans arbitrary fonts.
- It reads only the package-owned generated manifest and paths.
- It does not persist font state or include it in a JavaScript update.
- A font-list change requires a new native build.
- Schema changes require synchronized plugin, TypeScript, Swift, Kotlin,
  fixture, diagnostics, and clean-consumer updates.
- Readium upgrades must replay grouping tests plus Debug/Release and device
  journeys because the declaration APIs are toolkit-owned.
