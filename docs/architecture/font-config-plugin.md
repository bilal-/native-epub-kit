# Production font config plugin

Status: implemented for the 0.x SDK track.

## Outcome

The `native-epub-kit` Expo config plugin validates local TrueType/OpenType face
declarations, copies only package-owned native assets, writes deterministic
schema-versioned manifests, and reconciles Android assets plus iOS Xcode and
`UIAppFonts` registrations. Repeating Expo prebuild produces byte-identical
native configuration with one registration per generated resource.

This record owns native project generation and delivery only. Production native
family grouping and Readium registration are now frozen in the
[native font-registry record](./native-font-registry.md); the next typography
slice owns language, direction, class, fallback, and publisher-style profiles.

## Configuration

```json
{
  "expo": {
    "plugins": [
      [
        "native-epub-kit",
        {
          "fonts": [
            {
              "family": "Reader Serif",
              "source": "./assets/fonts/ReaderSerif-Regular.ttf",
              "style": "normal",
              "weight": 400
            },
            {
              "family": "Reader Serif",
              "source": "./assets/fonts/ReaderSerif-Bold.ttf",
              "style": "normal",
              "weight": 700
            },
            {
              "family": "Reader Serif",
              "source": "./assets/fonts/ReaderSerif-Italic.otf",
              "style": "italic",
              "weight": 400
            }
          ]
        }
      ]
    ]
  }
}
```

The options object is closed: only `fonts` is accepted. Each face is closed to
`family`, `source`, `style`, and `weight`:

| Field    | Contract                                                            |
| -------- | ------------------------------------------------------------------- |
| `family` | non-empty NFC string, at most 128 characters, no control characters |
| `source` | project-relative `.ttf` or `.otf` path                              |
| `style`  | `normal                                                             | italic`; default `normal` |
| `weight` | integer `1...1000`; default `400`                                   |

At most 64 faces may be configured. A family can contain multiple faces, but
the same `(family, weight, style)` tuple is rejected as ambiguous. Unknown
option/face fields fail so misspelled configuration cannot be silently ignored.

## Source validation

Validation runs before native assets are mutated. The plugin requires each
source to:

- resolve to a readable regular file inside the Expo project root;
- remain inside that root after real-path/symlink resolution;
- contain 12 bytes to 32 MiB;
- have a `.ttf` or `.otf` extension; and
- start with the TrueType `0x00010000` or OpenType/CFF `OTTO` signature.

The plugin deliberately does not accept arbitrary data renamed with a font
extension, absolute paths, `..` escapes, or symlinks to external files. Error
messages include the family and configured relative path without exposing
unnecessary native details.

Consumers remain responsible for font licensing, glyph coverage, internal
family/weight metadata, and redistribution permission. Validation proves a
bounded supported container, not legal provenance or complete shaping quality.

## Generated outputs

File names use the reserved `NativeEpubKit-` prefix plus stable declaration
index and sanitized source stem. The manifest schema remains version 1:

```json
{
  "schemaVersion": 1,
  "fonts": [
    {
      "family": "Reader Serif",
      "file": "NativeEpubKit-0-ReaderSerif-Regular.ttf",
      "path": "native_epub_kit/fonts/NativeEpubKit-0-ReaderSerif-Regular.ttf",
      "style": "normal",
      "weight": 400
    }
  ]
}
```

Android outputs:

- `android/app/src/main/assets/native_epub_kit/fonts/<generated-file>`;
- `android/app/src/main/assets/native_epub_kit/fonts.json`.

iOS outputs:

- `ios/NativeEpubKitFonts/<generated-file>`;
- `ios/NativeEpubKitFonts/NativeEpubKitFonts.json`;
- one Xcode Resources file/build reference per current output; and
- one current generated font entry in `UIAppFonts` per face.

The iOS manifest is a bundle resource but is not a `UIAppFonts` entry.

## Reconciliation and idempotency

The generated directories and `NativeEpubKit-` registrations are
package-owned. On every prebuild the plugin:

1. resolves and validates every source;
2. removes stale files from the package-owned destination;
3. copies only bytes that differ;
4. writes the manifest only when serialized content differs;
5. removes stale package-owned Xcode resource/build references;
6. skips Xcode additions that already exist; and
7. replaces reserved generated `UIAppFonts` entries while retaining unrelated
   consumer entries.

Configuring an empty font array removes both platforms' generated assets,
manifest, Xcode references, and reserved `UIAppFonts` entries. Restoring the
configuration creates one clean set again. This makes removal and face-list
changes safe in a checked-in native project, not only under `prebuild --clean`.

## Continuous Native Generation workflow

For an app that does not commit `ios/` and `android/`:

```sh
npx expo prebuild --clean
npx expo run:ios
npx expo run:android
```

Keep source fonts inside the Expo app root and keep the plugin declaration in
app config. `prebuild --clean` deletes native output, then this plugin recreates
the assets, manifests, Readium pods/desugaring, Xcode resources, and plist
entries. A JavaScript-only update cannot add or replace native font assets; a
new native build is required.

## Checked-in native project workflow

For an app that commits generated native projects:

```sh
npx expo prebuild --no-install
cd ios && pod install && cd ..
```

Run prebuild after adding, removing, reordering, or changing a face. Review and
commit app config, licensed font sources, manifests, copied native resources,
the Xcode project/plist, Podfile/lockfile, and Android build/assets as appropriate
for the repository. Do not hand-edit package-owned manifests or generated
`NativeEpubKit-` entries; the next prebuild will reconcile them.

Repeat `npx expo prebuild --no-install` once before commit when reviewing a
plugin or Expo upgrade. The second run should have no content diff. If the app
uses custom native project conventions outside standard Expo Groovy/Xcode
projects, test on a branch: Kotlin DSL Android app build files are not currently
supported by the Readium desugaring mod.

## Test and prebuild evidence

Unit/mod tests cover:

- closed option and face records;
- 64-face, family, style, weight, extension, and duplicate-face bounds;
- TrueType/OpenType signature, size, missing file, traversal, and symlink
  rejection;
- deterministic Android/iOS manifests;
- byte-preserving copy, stale pruning, and no-op repeated synchronization;
- stale/current Xcode resource reconciliation;
- reserved versus consumer `UIAppFonts` behavior; and
- registration of Android/iOS mods even for an empty set.

The real Expo example is also prebuilt repeatedly without cleaning. Selected
Podfile, Gradle, Xcode, plist, font, and manifest hashes are identical across
the first and second run. Exact Xcode build-file counts remain one per current
resource. Empty configuration removes every generated artifact; restoring and
repeating prebuild recreates one byte-identical set. Separate real prebuilds
prove actionable missing-file and invalid-signature failures.

## Boundaries

- Native code does not download fonts.
- No font path or family is added to public diagnostic reports.
- The plugin does not inject CSS, selectors, HTML, or JavaScript.
- Variable-font axis selection, font collections, WOFF/WOFF2, system-font
  aliases, fallback chains, per-script profile selection, and fixed-layout font
  replacement are outside LIB-040.
- Adding source files or running prebuild does not publish, upload, or transmit
  them.
