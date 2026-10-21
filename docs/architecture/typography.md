# Stable typography and publication-surface profiles

This record freezes the LIB-042 typography contract and LIB-043 constrained
publication-surface color extension for the 0.x SDK. It
replaces the fixed qualification-only mode with one typed, constrained profile
that is normalized in TypeScript and validated again by the Swift and Kotlin
adapters.

The design goal is deliberately narrower than CSS: choose installed font
families for known language, direction, or EPUB class targets; apply a closed
surface palette and a small set of reading declarations; and define how those
repairs interact with publisher styles. It does not expose a script, raw
selector, raw declaration, HTML transform, URL, layout rule, or
reading-progression escape hatch.

## Public surface

`typographyProfile` is a stable `EpubReaderView` prop:

```tsx
import { EpubReaderView, type TypographyProfile } from 'native-epub-kit';

const typographyProfile: TypographyProfile = {
  publisherStyles: 'hybrid',
  colors: {
    background: '#F5F0E8',
    link: '#005A8D',
    text: '#3D2B1F',
  },
  defaultFontFamilies: ['My Arabic Font', 'serif'],
  rules: [
    {
      target: { kind: 'language', value: 'ur' },
      fontFamilies: ['My Urdu Font', 'serif'],
      lineHeight: 1.65,
    },
    {
      target: { kind: 'language', value: 'ar' },
      fontFamilies: ['My Arabic Font', 'serif'],
      lineHeight: 1.65,
    },
    {
      target: { kind: 'class', value: 'quranic' },
      fontFamilies: ['My Quran Font', 'serif'],
      color: '#1A5F4A',
      fontWeight: 700,
    },
    {
      target: { kind: 'class', value: 'english' },
      fontFamilies: ['My Latin Font', 'serif'],
      direction: 'ltr',
    },
  ],
};

export function Reader({ uri }: { uri: string }) {
  return (
    <EpubReaderView
      source={{ kind: 'file', uri }}
      typographyProfile={typographyProfile}
      style={{ flex: 1 }}
    />
  );
}
```

Every non-generic family must also be declared through the package config
plugin. Font delivery remains a native-build concern:

```json
[
  "native-epub-kit",
  {
    "fonts": [
      {
        "family": "My Urdu Font",
        "source": "./assets/fonts/MyUrduFont.ttf",
        "weight": 400,
        "style": "normal"
      }
    ]
  }
]
```

The generated manifest and native registries are the authority for available
families. A JavaScript-only update cannot add or rename a native font.

## Closed profile grammar

The complete profile shape is:

```ts
interface TypographyProfile {
  publisherStyles: 'preserve' | 'hybrid' | 'override';
  colors?: {
    background: string;
    link: string;
    text: string;
  };
  defaultFontFamilies?: string[];
  rules?: Array<{
    target:
      | { kind: 'language'; value: string }
      | { kind: 'direction'; value: 'ltr' | 'rtl' }
      | { kind: 'class'; value: string };
    color?: string;
    fontFamilies?: string[];
    direction?: 'ltr' | 'rtl';
    lineHeight?: number;
    fontWeight?: number;
  }>;
}
```

Unknown keys are rejected at the profile, rule, and target levels. Validation
is atomic: one invalid field rejects the whole profile; no valid subset is
silently applied.

| Contract item                | Bound or rule                                                                |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Rules                        | zero through 32                                                              |
| Families per list            | zero through 8; an explicitly supplied rule list cannot be empty             |
| Native family name           | trimmed NFC, 1 through 128 UTF-16 units, no control characters or duplicates |
| Generic family               | `cursive`, `fantasy`, `monospace`, `sans-serif`, `serif`, or `system-ui`     |
| Language target              | ASCII BCP-47-shaped token; normalized to lowercase                           |
| Class target                 | one safe ASCII class token, at most 64 characters                            |
| Direction target/declaration | `ltr` or `rtl`                                                               |
| Surface/rule color           | exact `#RRGGBB`; normalized to uppercase                                     |
| Line height                  | finite `0.5...4`                                                             |
| Font weight                  | integer `1...1000`                                                           |

A rule must contain at least one declaration. When a rule omits
`fontFamilies`, it uses `defaultFontFamilies`; an empty default simply emits no
family declaration. Non-generic family names are case-sensitive and must match
an atomically admitted native family. Missing families fail with the stable
`TYPOGRAPHY_CONFIGURATION_FAILED` render error before a navigator is created.

The exported `normalizeTypographyProfile()` helper applies the JavaScript
half of this policy. Native validation is still authoritative because native
font availability cannot be established by TypeScript alone.

## Selector and declaration mapping

The adapters compile the closed model deterministically:

| Public target                          | Generated selector family                                           |
| -------------------------------------- | ------------------------------------------------------------------- |
| `{ kind: 'language', value: 'ur-pk' }` | rooted, doubled `:lang(ur-pk)` plus a doubled `lang` attribute form |
| `{ kind: 'direction', value: 'rtl' }`  | rooted, doubled `:dir(rtl)` plus a doubled `dir` attribute form     |
| `{ kind: 'class', value: 'quranic' }`  | `:root .quranic.quranic`                                            |

Only `background-color`, `color`, `font-family`, `direction`, `line-height`,
and `font-weight` can be emitted. The three surface colors are atomic and map
to the document background/body text/link selectors; a rule color maps only
to its validated target. All values come from exact six-digit colors,
validated enums, bounded numbers, or quoted and escaped native family names.
Consumers cannot supply punctuation in a class, an arbitrary selector,
`url()`, `@import`, custom properties, script, or raw CSS text.

The target component is intentionally repeated in each generated selector.
The generated link and visited-link selectors use the same guard and cover
link descendants. This gives the closed, library-owned declarations enough
specificity to beat Readium CSS's document-wide text inheritance and night
theme link rules while keeping each match set unchanged. Consumers still
cannot influence selector syntax.

The generated style element is tagged with a library-owned marker and is
idempotent. A resource transformed twice remains byte-identical after the
first successful injection.

## Publisher-style modes

| Mode       | Readium publisher styles | Profile stylesheet                                         | Intended use                                                                                  |
| ---------- | ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `preserve` | enabled                  | none                                                       | Trust the book exactly; retain the profile as configuration without loading unused app faces. |
| `hybrid`   | enabled                  | surface colors plus targeted rules                         | Keep publisher layout while repairing known scripts, directions, or semantic classes.         |
| `override` | disabled                 | surface colors, global default family, plus targeted rules | Prefer reader typography throughout reflowable content.                                       |

When no profile is provided, `preferences.publisherStyles` remains
authoritative. When a profile is present, its mode owns the Readium
publisher-style choice for reflowable content. Other reader preferences remain
independent. Publisher-owned alignment and line height are omitted from
Readium preferences when publisher styles are enabled, while explicit
constrained profile rules may still target the known content that needs repair.

Fixed-layout publications remain publisher-owned: no profile resource
transform or application font registration is installed for them. The profile
may remain in the atomic request, but it makes no promise to restyle a fixed
page.

## Content direction is not reading progression

`direction` in a typography rule styles matching document content. It never
changes page order, chapter order, logical forward/backward commands, gesture
mapping, or the publication's effective reading progression.

Navigator direction continues to come from the publication and the separate
validated `preferences.readingProgression` policy. The profile intentionally
has no progression field. Device tests capture the active native progression,
change the profile, and require the same value after recreation.

This separation matters for mixed books: an RTL publication can contain LTR
English blocks, and an LTR publication can contain Arabic or Urdu quotations,
without reversing the book's navigation semantics.

## Native delivery pipeline

Both platforms use supported Readium extension points:

```text
validated TypeScript profile
  -> atomic source/open envelope
  -> native profile + installed-family validation
  -> PublicationOpener transforming container (reflowable HTML only)
  -> deterministic semantic style element
  -> Readium native font-family declarations
  -> Readium EPUB navigator WebView
```

iOS uses `Publication.Builder.Transform`, Readium resources, and
`CSSFontFamilyDeclaration`. Android uses `TransformingContainer`,
`TransformingResource`, served assets, and
`EpubNavigatorFragment.Configuration` font declarations. Neither adapter
places native file paths in EPUB markup.

Only `.htm`, `.html`, and `.xhtml` resources can be transformed. The original
resource bytes are returned unchanged when a profile is absent, is in
`preserve` mode, the resource type is unsupported, the document encoding is
unsupported or invalid, or injection cannot be completed safely.

## Encoding and text-integrity policy

The stable transformer recognizes:

- UTF-8 with or without a BOM;
- UTF-16 little-endian with a BOM or the XML byte-order pattern; and
- UTF-16 big-endian with a BOM or the XML byte-order pattern.

It preserves the original byte order and BOM choice. The output keeps the
document's XML declaration, mixed English/Arabic/Urdu text, combining marks,
emoji, and extended grapheme clusters. Invalid data and declared unsupported
encodings such as ISO-8859-1 fail safe with byte-identical output rather than
being coerced through UTF-8.

This contract does not promise legacy-encoding conversion. A catalog item that
uses an unsupported encoding remains readable through its publisher content,
but the profile is not injected into that resource.

## Locator, selection, and lifecycle behavior

A profile is part of the atomic open request. A changed normalized profile
recreates the native navigator because the resource container and font
configuration are immutable after publication open. Before recreation the
adapter captures the current canonical Readium locator, then restores it and
emits the resulting location with reason `preference-change`.

The installed-device matrix verifies that profile changes preserve the same
resource/position anchor and the same reading progression. It also verifies
real platform-owned selection under an active hybrid profile:

- native Urdu selection remains in logical Unicode order;
- iOS and Android retain their native handles after the library action;
- normalized view/window rectangles remain consistent;
- the locator remains `EPUB/text/urdu-reading.xhtml`;
- explicit clear removes handles and the React Native marker; and
- iOS repeats the proof after portrait-to-landscape reflow.

The mixed-bidi fixture includes Arabic and Urdu combining marks, English,
emoji, an LTR isolate embedded in an RTL paragraph, language targets, class
targets, and the configured family. Visual screenshots and native contract
tests are retained under `artifacts/LIB-042` in the development checkout.

## Shared executable contract

`packages/testing/contracts/typography-profile-v1/cases.json` freezes eleven
cross-platform cases: absence, valid hybrid/override/preserve profiles,
normalization, deterministic CSS, family and color handling, and rejection of
unknown fields, malformed colors, selector-like classes, unavailable families,
empty rules, invalid numbers, and duplicate families.

The TypeScript reference policy, production Swift policy, and production
Kotlin policy all execute the same fixture. Native tests additionally cover
stylesheet idempotence, supported/unsupported resource paths, UTF-8/UTF-16
round trips, unsupported-encoding fail-safe behavior, and mixed-script
grapheme preservation.

## Security and support boundaries

- Profiles are local configuration; the SDK does not download fonts or CSS.
- Surface colors and rule colors accept only exact six-digit hexadecimal
  values; there is no alpha, token, URL, gradient, or raw declaration path.
- Native family names and asset paths never appear in support diagnostics.
- Unknown or unavailable family references fail closed rather than falling
  back silently.
- No consumer-supplied script or arbitrary stylesheet crosses the bridge.
- The API styles known reflowable EPUB content; it is not a general EPUB
  sanitizer and does not repair malformed publisher markup.
- Catalog-specific class rules should be minimal and backed by fixture/catalog
  evidence. `hybrid` is the recommended starting mode; `preserve` is the
  safest per-book fallback.

## Reference-app font audit

The webBooks mobile reference uses Roboto for body text, EB Garamond for
display text, Lateef for Arabic, Jameel Noori Nastaleeq for Urdu, and Noore
Huda for Quranic text. Lateef's OFL-1.1 terms were independently verified and
its unmodified Google Fonts file is used in the qualification app. Jameel
Noori Nastaleeq and Noore Huda were not copied into this open-source repository
because their redistribution terms have not yet been verified. Product parity
must not turn an installed app asset into an assumed open-source dependency.

The exact Readium pin and font CORS rationale remain documented in
[`native-dependencies.md`](../native-dependencies.md), while build-time font
admission and native grouping are documented in
[`font-config-plugin.md`](font-config-plugin.md) and
[`native-font-registry.md`](native-font-registry.md).

Typography rules also accept `borderTop: 'none'` to suppress a publisher's top-border decoration for a language, direction, or class. Consumers can combine it with `fontWeight` when replacing ruled quote emphasis. Other border values and raw CSS are rejected; the same closed property is validated and compiled on TypeScript, Swift, and Kotlin.
