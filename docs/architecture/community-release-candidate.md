# Community release candidate

Status: qualified locally; publication requires explicit owner authorization.

Date: 2026-07-20

## Decision

The headless `native-epub-kit` SDK satisfies the program's community-ready
release-candidate definition. Its public API, onboarding, recipes, migration
guidance, compatibility boundary, governance, native builds, and packed-package
consumer path are reproducible. There is no known reader P0 or P1 defect.

The optional generic UI package is intentionally absent. The completed Alislam
Books integration showed that the native viewport, records, commands,
capabilities, and persistence interfaces are the coherent reusable boundary.
The current reader chrome remains product-specific until a second real consumer
proves a smaller neutral UI contract.

This record does not publish, tag, push, sign, or upload anything. The repository
still has no commits and the npm package remains unpublished.

## Candidate identity

| Property          | Value                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Package           | `native-epub-kit@0.1.0`                                                                           |
| Archive           | `artifacts/LIB-100/package/native-epub-kit-0.1.0-community-rc.tgz`                                |
| Size              | 401,971 bytes                                                                                     |
| Files             | 218                                                                                               |
| SHA-256           | `064536a5eaf99e30a56656083ff550a3cf0f44bf4ebfa6624ef5cab11f39a5bc`                                |
| SHA-1             | `a7f74d96e86a0c97298ffca14ec5e6022f7acd94`                                                        |
| SHA-512 integrity | `sha512-/mQMWEj0yX7lHyZICO9tm93JVTu8V+uL5nZ4ubd5YNGFEcyRncvOMizp/RnUbvkxB3H/CNrvMVw2dSHovafUoA==` |
| Readium Swift     | Official upstream `3.10.0-fontfix.845` revision `e43a052ded9fab70d7f0e8f6f19bd7e9edeac94f`        |
| Readium Kotlin    | Official Maven release `3.1.2`                                                                    |

Two independent packs produced byte-identical archives. Inspection found no
workspace source import, internal build script, build intermediate, absolute
local path, private fixture, or copyrighted catalog material.

The archive was compared with the exact 212-file package already qualified in
Alislam Books, SHA-256
`78f3fb0d3f2908039409d6f08adf785a3ea1dc627883cb6e9259ba6952a59cb7`.
Every non-document payload is byte-for-byte identical. The only archive
differences are the README, changelog, and new or expanded documentation. The
community hardening therefore introduces no new reader runtime.

## Public documentation

The shipped documentation now provides:

- a five-minute Expo/local-EPUB path and minimal reader;
- a complete reader example with lifecycle, progress, chapters, preferences,
  footnotes/links, selection, decorations, search, and persistence composition;
- task-oriented recipes for local files and Android content URIs, progress and
  resume, chapters and gesture policy, typography, footnotes, annotations,
  search, sharing handoff, persistence, diagnostics, and accessibility;
- explicit troubleshooting and consolidated 0.x alpha migration guidance;
- exact supported and unsupported compatibility statements; and
- a generated reference for all 372 public exports.

`pnpm docs:check` regenerates/checks the reference, strictly compiles both
shipped examples, validates local links and required topics across 14 source
documents, and proves that marked README snippets match the executable sources.
The docs do not assume an Alislam catalog, database, theme, rights policy, or
font set.

## Repository and native verification

The final authored source passed:

- frozen pnpm installation;
- zero-warning ESLint and Prettier checks;
- all-workspace strict TypeScript checks;
- deterministic docs checks and package builds;
- 8 repository-policy tests, 224 SDK tests, and 3 testing-package tests;
- exact native-pin and workflow-policy validation;
- 10 reproducible public EPUB fixtures through EPUBCheck 5.3.0;
- production license inventory for 14 dependencies; and
- Android library unit tests/lint plus the generated example's Debug assembly
  (385 Gradle tasks).

The previously completed native qualification supplies the matching iOS build,
phone/tablet lifecycle and accessibility matrices, fixed LTR/RTL and mixed-bidi
typography evidence, footnote interception, selection geometry, decoration and
search stress, and performance/resource budgets. Alislam Books supplies a
separate 252/252 iOS and 252/252 Android catalog sweep, including all 27 Urdu
titles and 239 publications with Quranic markers.

## Source-isolated consumer proof

A fresh Expo consumer was created outside the repository and installed only the
final tarball plus its declared Expo 56 peer stack. It had no workspace link,
private patch, absolute source path, or access to package source files.

| Check                   | Result                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Package/runtime exports | PASS: Node exports resolve from the packed build                                           |
| Shipped examples        | PASS: both compile under strict TypeScript against the installed package                   |
| Expo prebuild           | PASS: clean iOS and Android projects generated from the documented plugin                  |
| Android                 | PASS: clean 194-task Debug build                                                           |
| CocoaPods               | PASS: 92 dependencies / 96 pods; `NativeEpubKit 0.1.0`, Readium Swift `3.10.0-fontfix.845` |
| iOS                     | PASS: clean generic-simulator Xcode build; universal arm64/x86_64 app with Readium bundles |

The iOS and CocoaPods logs contain only upstream toolchain warnings, including
duplicate local/trunk specification discovery for the exact Readium podspec and
standard Expo/React Native script-phase notices. They contain no package compile
error or fallback to monorepo source.

## Community-ready acceptance mapping

| Requirement                                    | Evidence                                                                                         | Result                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- |
| Public APIs documented and reviewed            | Generated 372-export reference, executable examples, recipes, migration, troubleshooting         | PASS                            |
| Cross-platform capability or honest fallback   | Compatibility matrix and limitations; stable capability/warning records                          | PASS                            |
| Required fixtures and feature example          | 10 public fixtures, real native example, complete headless feature surfaces                      | PASS                            |
| Fonts, bidi, footnotes, selection, annotations | Fixed native matrices plus app integration/device evidence                                       | PASS                            |
| Accessibility and reliability                  | Core phone/tablet platform gate plus consumer checklist                                          | PASS                            |
| Performance and resource budgets               | Qualified cold/warm open, exact restore, event rate, decorations, search, and 20-cycle ownership | PASS                            |
| Broad production content                       | Alislam Books static/iOS/Android 252/252 catalog sweep                                           | PASS                            |
| Clean package consumer                         | Node, TypeScript, CNG, Gradle, CocoaPods, and Xcode from the packed tarball                      | PASS                            |
| Governance, license, notice, support, security | Repository policies and production inventory                                                     | PASS                            |
| App consumption without private runtime patch  | Community runtime bytes match the exact app-qualified SDK payload                                | PASS                            |
| Generic UI package                             | Explicitly deferred; no unsupported generic surface is claimed                                   | PASS by recorded scope decision |

## Security audit note

The package has no ordinary npm runtime dependencies; Expo, React, and React
Native are peers. An npm production audit of the clean Expo 56 consumer reports
11 moderate findings that collapse to the upstream Expo CLI/config path through
`xcode` and `uuid` advisory `GHSA-w5hq-g745-h8pq`. npm reports no compatible fix
for the qualified Expo 56 graph. This is a build-tool dependency inherited from
the required peer environment, not reader code or a bundled app-runtime path;
there are no high or critical findings. It remains an explicit watch item for
the next Expo compatibility upgrade and must not be hidden by a forced,
unqualified override.

The repository's read-only dependency review, secret scanning, path admission,
remote-source denial, bounded publication-data surfaces, and no-script-injection
policy remain unchanged.

## Known support boundary

The qualified line is Expo SDK 56, React Native 0.85.3, React 19.2.3, iOS 16.4+
and Android API 24+, using the New Architecture. Web, PDF, LCP, cloud sync,
production text-to-speech, bare React Native setup, simultaneous Android readers
in one activity, and custom Android activities that restore publication-bound
fragment state are not claimed. Android fixed-layout image activation remains a
documented pinned-Readium capability gap.

## External release boundary

The source is ready to enter an authorized release workflow. The owner must
still explicitly authorize repository commits/pushes, Changesets versioning and
tag selection, npm publication, provenance/GitHub release creation, and any
consumer replacement of the local artifact. Standard `changeset status` cannot
compute branch divergence until the intentionally commit-free repository has a
`main` history; the checked-in changesets and repository policy tests are ready
for that bootstrap.
