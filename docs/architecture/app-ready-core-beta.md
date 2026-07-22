# App-ready core beta

Status: **PASS** for the Alislam Books pinned Expo application path.

This record closes the app-required documentation and clean-consumer gate for
the unpublished Native EPUB Kit 0.x candidate. It does not claim broad React
Native compatibility, a frozen 1.0 API, or community-release readiness.

## Exact candidate

| Item                  | Value                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Package               | `native-epub-kit@0.1.0`                                                                           |
| Working branch        | `reader-modernization`                                                                            |
| Source commit         | None; creating a commit is outside the current authorization boundary                             |
| Tarball               | `artifacts/LIB-092/package-final-a/native-epub-kit-0.1.0.tgz`                                     |
| Size                  | 376,095 bytes                                                                                     |
| Files                 | 212                                                                                               |
| SHA-256               | `7d46b12c11b2c799e130feb211cc5cdc385b144a87ea9616a2e739c34d3bb12d`                                |
| npm SHA-512 integrity | `sha512-3zCpbnSTg/XVhukklHN2NZpwyCcCC829960PbdrplJ5XLZQDq6LEJlZXiCznW5vKBj+ki/Z8oY/dMUJEizygqw==` |

The tarball hash is the immutable identity while the branch intentionally has
no commit. Two independent `pnpm pack` runs produced byte-identical tarballs.
Publishing, tagging, pushing, and committing remain separate authorization
gates.

## Qualified compatibility

| Layer                       | Qualified value                                                           |
| --------------------------- | ------------------------------------------------------------------------- |
| Expo                        | SDK 56 (`>=56.0.0 <57.0.0`)                                               |
| React Native                | 0.85 (`>=0.85.0 <0.86.0`)                                                 |
| React                       | 19.2 (`>=19.2.0 <20.0.0`)                                                 |
| iOS application minimum     | 16.4                                                                      |
| Android application minimum | API 24                                                                    |
| Readium Swift               | `3.10.0-fontfix.845`, revision `e43a052ded9fab70d7f0e8f6f19bd7e9edeac94f` |
| Readium Kotlin              | 3.1.2, tag commit `71074ea0c424eabbc39a93b48a4cefe366f7741b`              |

The final consumer ran with Node 26.0.0, npm 11.12.1, Xcode 26.6, macOS
26.5.2, Temurin 21.0.11, and Gradle 9.3.1. These tool versions describe the
evidence environment; the public compatibility contract remains the bounded
Expo/React Native ranges above.

## Documentation audit

The following guides are bundled in the package and are usable without the
monorepo:

| Required application surface                                   | Bundled guide                      |
| -------------------------------------------------------------- | ---------------------------------- |
| Compatibility, install, plugin, local sources, fonts           | `docs/getting-started.md`          |
| Lifecycle, events, commands, capabilities, errors, diagnostics | `docs/core-api.md`                 |
| Locators, progress, chapters, continuation, typography         | `docs/product-integration.md`      |
| Footnotes, links, selection, decorations, search, images       | `docs/product-integration.md`      |
| Consumer persistence and close/background lifecycle            | `docs/product-integration.md`      |
| Known constraints and exact native upgrade procedure           | `docs/limitations-and-upgrades.md` |

The package README links only to those bundled files for the supported setup.
Deeper architecture links use repository URLs. Broad tutorials, a generic UI
kit, bare React Native support, and compatibility beyond the qualified line are
explicit post-app work.

## Clean-consumer proof

A new Expo application was created under `artifacts/LIB-092/consumer` with no
workspace dependency and no monorepo source import. It installed only the final
tarball path, then passed:

- strict TypeScript compilation and a Node public-export smoke;
- `expo prebuild --clean --no-install` with the documented plugin setup;
- CocoaPods resolution of `NativeEpubKit (0.1.0)` and the exact Readium Swift
  integration version;
- an unsigned generic iOS Simulator Debug build of the complete 108-target
  workspace;
- Android `:app:assembleDebug` (194 tasks) with Native EPUB Kit 0.1.0 and
  Readium Kotlin 3.1.2, producing a 133 MB universal debug APK;
- an archive scan proving required JavaScript, declarations, native sources,
  plugin, podspecs, pins, licenses, and all five bundled documents are present;
- an archive scan finding no absolute developer path, top-level package
  `src/`, unpublished `internal/` tooling, workspace dependency, or private
  patch.

The exact final tarball was reinstalled after the first proof and both native
projects were regenerated and rebuilt. The result bundles and build products
remain in the ignored LIB-092 artifact directory.

## Dependency review

`npm audit` reports 11 moderate and zero high or critical findings in the Expo
56 configuration toolchain. They converge on Expo CLI/config plugins and the
`xcode` package's transitive `uuid` advisory; npm reports no compatible fix for
the pinned Expo line. Native EPUB Kit introduces no separate vulnerable direct
runtime dependency. This is recorded rather than silently changing the
qualified framework versions.

## Gate conclusion

All app-required core documentation exists in the packed package, the package
is reproducible, and a source-isolated Expo consumer builds on both native
platforms exactly as documented. Community onboarding and stable 1.0 polish
remain intentionally outside this app-ready beta gate.

The Alislam Books application then installed these exact packed bytes, passed
269/269 application tests and every reader harness, compiled its full iOS and
Android Debug applications, and opened the production native reader on the
dedicated iPad and Android tablet. `GATE-SDK-APP` therefore admits this digest
for the app and authorizes removal of the temporary legacy reader.
