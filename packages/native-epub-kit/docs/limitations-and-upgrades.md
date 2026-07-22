# Known limitations and native upgrades

## Supported boundary

- EPUB only; PDF, LCP, web books, cloud sync, production TTS, and generic reader
  UI are outside the current package.
- Expo SDK 56 / React Native 0.85 is the qualified line. Bare React Native setup
  is not documented or supported by the app-ready 0.x candidate.
- Expo Go is unsupported because the package contains Swift and Kotlin code.
- Remote publication sources are rejected before networking. Applications
  download and authenticate outside the SDK, then open a local file.
- One concurrent Android reader per `FragmentActivity` is qualified.
- Android fixed-layout image activation is unavailable with Readium Kotlin
  3.1.2; capabilities report this explicitly.
- Selection geometry is an optional aggregate rectangle, not one rectangle per
  rendered line. The selected DOM node's exact language is not available from
  the pinned native APIs.
- Android may expose position/resource precision where iOS exposes continuous
  viewport precision. Consumers must use the event's `precision` field.
- The package does not remediate inaccessible publisher content and does not
  expose arbitrary scripts, CSS, HTML templates, URL fetching, or key maps.

## Exact native pins

The package's `native-dependencies.json` is authoritative:

- Readium Swift uses the signed post-3.10.0 PR-845 merge revision required for
  the qualified font-loading behavior.
- Readium Kotlin is 3.1.2, the newest qualified release compatible with Expo
  56's Kotlin metadata level.

Do not relax pins, suppress Kotlin metadata checks, override pods, or add a
second Readium graph in the consuming app.

## Upgrade procedure

Treat every Expo, React Native, Readium, WebView/WebKit, Swift/Kotlin, iOS
minimum, or Android SDK change as an isolated compatibility task:

1. update only the candidate pins and compatibility record;
2. regenerate a clean Expo native project;
3. verify one Readium graph on both platforms;
4. run shared TypeScript/Swift/Kotlin contract fixtures;
5. build and exercise lifecycle, exact restore, RTL/fonts, footnotes/links,
   selection, decorations, images, search, accessibility, and navigation
   policy on iOS and Android;
6. repeat the performance and twenty-cycle ownership report;
7. install the packed tarball into a clean consumer with no workspace source
   imports; and
8. rerun the production catalog/deep-language sweep before app release.

A version number or successful compile is not sufficient evidence of behavioral
compatibility.

## Diagnostics and reports

`getDiagnostics()` is intentionally bounded and redaction-safe. It reports SDK
and toolkit versions, platform, layout/precision, feature stages, font-manifest
health, preference support, and warning markers. It excludes source URI and
headers, publication identity/content, Locators, selections, font paths/names,
native stack traces, and device details.

The SDK performs no telemetry and sends no report. A consuming app may format
the snapshot with `createReaderDiagnosticReport()` and offer an explicit
user-initiated share flow.

## Release status

The qualified 0.x line is a community release candidate, not a frozen 1.0 API.
It includes broad recipes, generated API inventory, executable examples,
troubleshooting, migration guidance, governance, two clean Expo consumers, and
the complete Alislam catalog/deep-script evidence. A generic UI package, bare
React Native setup, and broader physical-OEM matrices remain explicitly outside
the current contract rather than being implied by the community-ready docs.
