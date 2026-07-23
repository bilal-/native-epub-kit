# Compatibility

| Surface                    | Qualified baseline                                                                |
| -------------------------- | --------------------------------------------------------------------------------- |
| Expo                       | SDK 56                                                                            |
| React Native               | 0.85.3                                                                            |
| React                      | 19.2.3                                                                            |
| Architecture               | New Architecture                                                                  |
| iOS                        | 16.4+ (Readium minimum is 15.0)                                                   |
| Android                    | 7+ / API 24+ (Readium minimum is 23)                                              |
| Android compile/target SDK | 36                                                                                |
| Xcode / Swift              | Xcode 26.6 / Swift 6.3.3 tested; Readium package uses Swift tools 5.10            |
| CocoaPods                  | 1.16.2 tested                                                                     |
| JDK / Gradle / Kotlin      | Temurin 21 / Gradle 9.3.1 / Kotlin 2.1.20 in generated Expo app                   |
| Node.js for development    | 22.13+; 26.0.0 tested locally                                                     |
| Package manager            | pnpm 11.15.1                                                                      |
| Readium Swift              | 3.10.0 base at exact upstream revision `e43a052ded9fab70d7f0e8f6f19bd7e9edeac94f` |
| Readium Kotlin             | Exact Maven release 3.1.2                                                         |

Only iOS and Android are in the initial support contract. Web, PDF, LCP, cloud
sync, and production text-to-speech are out of scope for the first release.

## Qualified consumer profiles

| Consumer                       | Purpose                                                                                                                                | Result                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Generated example app          | Public fixtures plus lifecycle, native API, accessibility, RTL/font, navigation-policy, and performance qualification                  | Both native platforms pass on phone/tablet simulator profiles.                    |
| Fresh source-isolated Expo app | Packed-tarball install, config-plugin prebuild, strict typecheck, single native graph, Android Debug, and unsigned iOS Simulator build | Pass with no monorepo source import or private patch.                             |
| Alislam Books                  | Independent product integration and 252-publication catalog, including 27 Urdu and 239 Quranic-marker titles                           | Static, iOS, and Android sweeps pass; app remains a consumer, not library policy. |

The tested device set includes iPhone and iPad simulator profiles plus Android
phone and tablet AVDs. This proves the declared Expo baseline, not every OEM
WebView or custom native host. Bare React Native, simultaneous Android readers,
and custom activities that restore fragment state are unsupported until a
separate qualification expands this matrix.

## Native pin rationale

Readium Swift 3.10.0 contains the upstream footnote interception repair needed
by the qualification plan. Custom URL-based fonts regressed when the toolkit
moved EPUB rendering to `WKURLSchemeHandler`; upstream PR 845 fixes the asset
route's CORS response, but was merged after 3.10.0 and no later release tag
exists yet. The iOS integration therefore uses the signed upstream merge commit
directly. It does not use a fork or patched source. Four small local podspecs
select that immutable commit and otherwise describe the official unmodified
modules. They will be removed in favor of the first official tag containing PR
845 after the normal upgrade suite passes.

Readium Kotlin 3.3.0 is the current upstream release, but its artifacts carry
Kotlin metadata 2.3.0. Expo SDK 56 compiles native modules with Kotlin 2.1.20,
which can read metadata only through 2.2. A measured build fails before source
compilation, so suppressing the metadata check or forcing Expo's full native
toolchain forward is not supported. Readium 3.1.2 is the newest release built
with Kotlin 2.1 metadata; it compiles and assembles cleanly with Expo 56 and
also contains the upstream RTL vertical-scroll and 16 KB page-size fixes.

Readium Kotlin 3.1.2 does not pass custom schemes such as `mailto:` through its
public external-link callback because its internal `AbsoluteUrl` conversion
rejects them. Native EPUB Kit wraps that exact pinned WebView-listener seam to
emit and block/intercept only main-frame custom schemes. The
original listener handles every other request. Consumer ProGuard rules retain
the seam under minification, and the installed device matrix rejects the
unknown-scheme WebView fallback. This compatibility adapter must be re-audited
or removed during every Readium Kotlin upgrade.

Readium Kotlin 3.1.2 also lacks the fixed-layout target-element input surface
used for publication-image activation. Native EPUB Kit supports reflowable
image hit testing on Android but reports fixed-layout images as unavailable
with a stable capability warning. Readium Swift's pinned target-element API
supports both layouts. This asymmetry must be re-qualified during every Kotlin
upgrade; the SDK does not claim false cross-platform parity.

The newer Android publication-asset CORS fix first released in Readium 3.3.0
is not required by the qualified app-asset path: LIB-013 loaded the copied
Lateef font through Readium 3.1.2 on Android and through the PR-845 revision on
iOS. Both WebViews reported the selected family through computed styles and
passed the same preserve/hybrid/override runtime flow. This does not broaden
the source contract to remote fonts or justify metadata suppression.

## CNG integration requirements

Expo applications must list `native-epub-kit` in their `plugins` array. The
package's idempotent config plugin:

- adds the official Readium CocoaPods source plus exact commit-backed podspecs;
- marks Minizip as modular for static Swift integration; and
- enables Android core-library desugaring with the exact upstream tool version;
  and
- validates and copies declared local `.ttf`/`.otf` faces into native app
  resources, with a closed generated manifest consumed by Readium.

The example application is regenerated from configuration for every native CI
job. The plugin transform has unit and idempotence coverage. Bare React Native
manual integration remains deferred until the Expo path is stable.

## Native view lifecycle boundary

The Expo SDK 56 / New Architecture path now hosts a real Readium navigator and
is runtime-qualified on iPhone 17 Pro / iOS 26.5 and Pixel 8 / Android API 36.1.
The shared device flow covers source replacement, ten mount/unmount cycles,
rotation, background/foreground, and process relaunch. Every ready checkpoint
reports exactly one navigator in its native host.

One concurrent reader per Android `FragmentActivity` is currently qualified.
Expo's generated `MainActivity` calls `super.onCreate(null)`, so Android process
or activity recreation starts a new publication session and does not ask
FragmentManager to restore a publication-bound fragment. Bare/custom React
Native activities that pass saved instance state and simultaneous Android
reader views are not supported yet. See the
[lifecycle architecture record](./architecture/lifecycle.md) for ownership,
cancellation, evidence, and the remaining limits.

The production source contract accepts readable local `file:` EPUBs on both
platforms and caller-granted Android `content:` URIs through
`ContentResolver`. iOS document-provider URLs must first be resolved to a
security-scoped file URL; the lease is then held for the publication lifetime.
Missing, corrupt, unsupported, and unreadable sources have typed stable errors
and recovery. Remote URLs are rejected before networking. See the
[production publication-session record](./architecture/production-publication-session.md).

## Upgrade policy

The canonical machine-readable pins are in
`packages/native-epub-kit/native-dependencies.json`; `pnpm native-pins:check`
rejects drift, floating toolkit versions, non-commit Swift sources, mismatched
diagnostics, or missing package files. Every upgrade is isolated and must run
the public fixture matrix, consuming-app catalog sweep, locator compatibility,
typography screenshots, and both platform builds before this matrix changes.

See [Native dependencies](./native-dependencies.md) for the resolved graph,
license inventory, and exact integration mechanism.
