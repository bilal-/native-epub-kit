# Native dependency record

This record describes the LIB-010 dependency qualification performed on
2026-07-11. `packages/native-epub-kit/native-dependencies.json` is the canonical
machine-readable pin set.

## Readium Swift

| Property                    | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| Upstream repository         | `https://github.com/readium/swift-toolkit.git`         |
| Stable base                 | 3.10.0 / `ec5f552b06a1117f3e2f50fca466058f494ae8b5`    |
| Selected revision           | `e43a052ded9fab70d7f0e8f6f19bd7e9edeac94f`             |
| Local integration version   | `3.10.0-fontfix.845`                                   |
| Selected products           | `ReadiumShared`, `ReadiumStreamer`, `ReadiumNavigator` |
| Upstream delta              | Eight commits after 3.10.0, ending with merged PR 845  |
| Minimum iOS                 | 15.0 upstream; 16.4 package baseline                   |
| Swift package tools version | 5.10                                                   |
| License                     | BSD-3-Clause                                           |

The eight-commit delta contains documentation/CI changes, OPDS URL corrections,
a selection editing-action repair, LCP passphrase API work, an audio navigator
memory fix, and the required font asset CORS fix. EPUB builds exercise Shared,
Streamer, and Navigator only; LCP and audio are outside the first release.

LIB-013 compared the immutable `WebViewServer.swift` source at the release tag
and selected revision. The 3.10.0 blob (SHA-256 `517b8c40...83b`) has no font
CORS response; the selected blob (SHA-256 `4a644bd1...500`) serves static font
assets with `Access-Control-Allow-Origin`. The native pin validator rejects the
release-tag commit and checks the full selected blob hash whenever CNG has
installed Pods. A real Lateef face then loaded successfully in the iOS WebView.

The following CocoaPods graph is exact. The custom Readium podspecs derive all
versions from the canonical JSON manifest and use equality constraints:

| Pod                  | Version              | Role                             | License                                |
| -------------------- | -------------------- | -------------------------------- | -------------------------------------- |
| ReadiumInternal      | `3.10.0-fontfix.845` | Readium internal utilities       | BSD-3-Clause                           |
| ReadiumShared        | `3.10.0-fontfix.845` | Publication model and resources  | BSD-3-Clause                           |
| ReadiumStreamer      | `3.10.0-fontfix.845` | EPUB parsing/opening             | BSD-3-Clause                           |
| ReadiumNavigator     | `3.10.0-fontfix.845` | EPUB navigator                   | BSD-3-Clause                           |
| CryptoSwift          | 1.10.0               | Streamer cryptography primitives | Custom attribution license (Zlib-like) |
| DifferenceKit        | 1.3.0                | Navigator collection differences | Apache-2.0                             |
| Minizip              | 1.0.0                | ZIP handling                     | MIT                                    |
| ReadiumFuzi          | 4.0.0                | XML parsing                      | MIT                                    |
| ReadiumZIPFoundation | 3.0.1                | ZIP handling                     | MIT                                    |
| SwiftSoup            | 2.11.3               | HTML parsing                     | MIT                                    |

CocoaPods 1.16.2 generated 117 Xcode build targets for the complete Expo app.
The generic iOS simulator build compiled all Readium source at the selected
commit. Podspec checksums observed in that clean install are retained in the
LIB-010 execution evidence; regenerated app directories and their lockfile are
intentionally not source-controlled under CNG.

## Readium Kotlin

| Property           | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| Maven group        | `org.readium.kotlin-toolkit`                              |
| Exact version      | 3.1.2                                                     |
| Tag commit         | `71074ea0c424eabbc39a93b48a4cefe366f7741b`                |
| Selected artifacts | `readium-shared`, `readium-streamer`, `readium-navigator` |
| Upstream build     | Kotlin 2.1.21, Gradle 8.14.1, compile SDK 36              |
| Consuming build    | Kotlin 2.1.20, Gradle 9.3.1, JDK 21, compile SDK 36       |
| Minimum Android    | API 23 upstream; API 24 package baseline                  |
| License            | BSD-3-Clause                                              |

The first-order runtime graph resolved by Gradle is:

| Area                         | Exact resolved components                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kotlin                       | stdlib/reflect/parcelize 2.1.21                                                                                                                          |
| Coroutines and serialization | coroutines 1.10.2, datetime 0.7.1, serialization JSON 1.8.1                                                                                              |
| Parsing/logging              | jsoup 1.18.1, Timber 5.0.1, Koi core 0.5.5                                                                                                               |
| Android UI                   | appcompat 1.7.0, browser 1.8.0, constraintlayout 2.2.1, core 1.16.0, fragment 1.8.7, legacy UI 1.0.0, lifecycle 2.9.0, RecyclerView 1.4.0, WebKit 1.13.0 |
| Media navigator transitives  | Media3 common/session/ExoPlayer 1.7.1                                                                                                                    |
| Build/runtime support        | annotations 1.9.1, View Binding 8.10.1, bundled PhotoView 2.3.0                                                                                          |
| Core-library desugaring      | `com.android.tools:desugar_jdk_libs:2.1.5`                                                                                                               |

AndroidX, Media3, Kotlin, kotlinx, Timber, Guava, and JSpecify components are
Apache-2.0; jsoup is MIT; Readium is BSD-3-Clause. Koi and the bundled PhotoView
are Apache-2.0. No reciprocal/copyleft native dependency was found.

LIB-013 also loaded the copied Lateef face through Readium Kotlin 3.1.2's
`servedAssets` and `fontFamilyDeclarations` path. This proves the exact path in
scope without claiming that every cross-origin publication-asset behavior from
3.3.0 exists in 3.1.2.

Gradle's resolved graph upgrades the app-wide Kotlin runtime from 2.1.20 to
2.1.21, which is metadata-compatible and passed compile, unit tests, lint,
desugaring, DEX, and APK assembly. In contrast, the rejected 3.3.0 probe pulled
Kotlin 2.3.20 and failed with an explicit metadata 2.3.0 versus 2.1.0 mismatch.

The package declares AndroidX Fragment KTX 1.8.7 directly. Readium uses it as
an implementation dependency, while the Expo view host itself compiles against
`FragmentActivity`, `FragmentContainerView`, and `FragmentManager`; relying on
Readium's hidden transitive classpath would make that integration accidental.
The exact version is part of the canonical native pin manifest and validator.

## Diagnostics and drift controls

Both native module implementations expose a `nativeDependencies` constant.
iOS reports the Readium base and full revision; Android reports the Gradle-
generated Readium version. Both also resolve a Readium `Publication` type at
compile time, preventing a misleading pin from passing without actual linkage.

`pnpm native-pins:check` validates the canonical manifest against Gradle,
CocoaPods integration metadata, the Expo config plugin, Swift diagnostics,
Kotlin diagnostics, and npm package contents. Native builds then prove actual
resolution. No Readium source directory, fork, submodule, or patch is present.
