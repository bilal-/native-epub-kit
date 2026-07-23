# Native EPUB Kit

An open-source native EPUB foundation for Expo and React Native applications,
powered by the official Readium Swift and Kotlin toolkits.

> **Unofficial project:** Native EPUB Kit is an independent community project.
> It is not affiliated with, sponsored by, or endorsed by Expo, 650 Industries,
> the Readium Foundation, or EDRLab. Expo and Readium are mentioned only to
> describe compatibility and upstream dependencies. Their names and logos are
> not project branding.

## Status

Unpublished community release candidate on the 0.x line. The supported Expo
application path has passed the qualified lifecycle, publication, navigation,
progress, typography, footnote, selection, decoration, search, accessibility,
performance, catalog, app-integration, documentation, and clean-consumer
gates. The public API remains pre-1.0 and may change under semver, but the
candidate is ready for publication once the owner explicitly authorizes it.

The project will provide:

- A typed Expo Modules bridge to the official Readium mobile toolkits.
- Symmetric Swift, Kotlin, and TypeScript lifecycle and reader contracts.
- EPUB navigation, locators, progress, chapters, footnotes, selection,
  decorations, typography, search, and diagnostics.
- A headless controller driven by consumer-owned persistence and product UI.
- Publicly licensed fixtures and cross-platform contract tests.

The initial implementation is EPUB-only. It will not fork or copy the Readium
rendering engines.

## Planning

- Canonical library plan: [`docs/architecture/product-plan.md`](docs/architecture/product-plan.md)
- Naming and attribution decision: [`docs/architecture/naming.md`](docs/architecture/naming.md)
- App-ready beta evidence: [`docs/architecture/app-ready-core-beta.md`](docs/architecture/app-ready-core-beta.md)
- Community release-candidate evidence: [`docs/architecture/community-release-candidate.md`](docs/architecture/community-release-candidate.md)
- App-ready consumer guides: [`packages/native-epub-kit/docs/`](packages/native-epub-kit/docs/README.md)
- Generated public API reference: [`packages/native-epub-kit/docs/api-reference.md`](packages/native-epub-kit/docs/api-reference.md)
- Consuming program repository: [Alislam Books](https://git.alislam.dev/mobile/ebooks-reactnative)

Implementation work is occurring on a non-default branch. The app-required
core reader has stable 0.x contracts, but no package has been published.

## Workspace

The repository uses pnpm workspaces:

- `packages/native-epub-kit` — publishable headless Expo native module.
- `packages/testing` — private shared fixture and contract-test utilities.
- `apps/example` — Expo SDK 56 development client using Continuous Native
  Generation.

Install and run the baseline from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm docs:check
pnpm test
pnpm build
pnpm fixtures:verify
```

Build the generated qualification reader with `pnpm example:ios` or
`pnpm example:android`. It renders the same generated EPUB through real Readium
navigators and exposes controls for source replacement and destructive
mount/remount testing. Native app directories are generated locally from
`apps/example/app.json` and are not source-controlled. The current containment
and cancellation model is documented in the
[native lifecycle record](docs/architecture/lifecycle.md).

The production session supports readable local EPUB files on both platforms
and existing-grant Android `content:` URIs. Remote sources are explicitly
disabled before networking. Stable source errors, Apple security scopes,
stale-open cancellation, one-shot cleanup, and bounded 20-cycle resource
growth are covered in the
[production publication-session record](docs/architecture/production-publication-session.md).
The stable lifecycle-level React view now accepts the shared source object and
provides ordered state/ready/error/location callbacks plus typed async ref
commands. See the
[stable native view API](docs/architecture/stable-native-view-api.md).
Detached metadata, hierarchical TOC/reading-order links, fixed-layout
detection, capability diagnostics, and bounded Readium position pages are
documented in the
[publication-data record](docs/architecture/publication-data.md).
Canonical locator/link/progression/position commands, logical boundaries, and
atomic initial restore are documented in the
[navigation and restore record](docs/architecture/navigation-and-restore.md).
Validated theme/layout/text preferences, fixed-layout policy, live
locator-preserving updates, and capability-aware settings are documented in
the [reader-preferences record](docs/architecture/reader-preferences.md).
Exact toolkit/package identity, staged feature availability, font-manifest
health, bounded warning markers, and the deliberately minimized issue-report
schema are documented in the
[support-diagnostics record](docs/architecture/support-diagnostics.md).
Deterministic top-level, leaf, and explicit-depth chapter boundaries, stable
IDs, duplicate aliases, reading-order fallback units, coherent position paging,
and bounded derivation diagnostics are documented in the
[navigation-unit record](docs/architecture/navigation-units.md).
Visible-start chapter/overall progress, honest precision, and current versus
furthest controller state are documented in the
[reader-progress record](docs/architecture/reader-progress.md). Separate page
and chapter gesture gates, conservative defaults, logical LTR/RTL directional
input, edge taps, hardware keys, and runtime application status are documented
in the [runtime navigation-policy record](docs/architecture/navigation-policy.md).
Exact derived-unit guarding, adjacent boundary events, direct unit commands,
and bounded ephemeral jump/back history are documented in the
[navigation-unit boundaries/history record](docs/architecture/navigation-boundaries-history.md).
Validated multi-face font assets, deterministic manifests, repeatable CNG, and
checked-in native-project reconciliation are documented in the
[production font config-plugin record](docs/architecture/font-config-plugin.md).
Atomic native manifest admission, one-family/many-face Readium registration,
weight/style descriptors, and redaction-safe runtime counts are documented in
the [native font-registry record](docs/architecture/native-font-registry.md).

Synchronous semantic interception, conservative malformed-publisher
classification, bounded note content, canonical source/target locators,
consumer downgrade, and explicit external/unsupported scheme behavior are
documented in the
[production footnote/link record](docs/architecture/footnotes-links.md).

Configured native selection actions, rights-aware bounded text, explicit
selection lifecycle, generation ownership, and clipped logical reader/window
geometry are documented in the
[production selection record](docs/architecture/selection.md).

Publication accessibility ownership, native focus/selection/key behavior,
phone/tablet lifecycle coverage, consumer responsibilities, and explicit
platform limitations are documented in the
[core accessibility and reliability record](docs/architecture/accessibility-platform-reliability.md).

Instrumented cold/warm open, source replacement, typography, decorations,
search, exact restore, memory ownership, progress-event rate, and
hardware-accelerated frame results are documented in the
[core performance and reliability record](docs/architecture/performance-reliability.md).

Isolated full/delta groups, safe highlight/underline/margin/custom styles,
canonical activation data/geometry, and the 2,000-decoration qualification are
documented in the
[decoration record](docs/architecture/decorations.md).

Bounded generation-scoped search, forward-only single-use cursors, canonical
locator/excerpt mapping, native cancellation, explicit truncation, and
independent result/current decoration groups are documented in the
[native search-session record](docs/architecture/search.md).

Strict durable progress/bookmark/annotation/preference records, the
consumer-supplied adapter boundary, deterministic in-memory reference adapter,
serial optimistic mutations with rollback, and lifecycle-safe throttled
progress flushing are documented in the
[persistence/controller record](docs/architecture/persistence.md).

The stable JSON-backed TypeScript/Swift/Kotlin record and error boundary
is documented in the [shared record contract](docs/architecture/shared-records.md).
Fourteen identical golden payloads enforce enum values, units, nullability, and
unknown Readium locator extension preservation across all three languages.

App-supplied family fallbacks, language/direction/class rules,
preserve/hybrid/override behavior, UTF-8/UTF-16 byte safety, mixed-script
selection, and progression-independent content direction are covered in the
[stable typography-profile record](docs/architecture/typography.md). It uses
supported Readium declarations and publication resource transforms; no
consumer script or raw stylesheet surface is exposed.

Readium revisions are exact and checked by `pnpm native-pins:check`. See the
[compatibility matrix](docs/compatibility.md) and
[native dependency record](docs/native-dependencies.md) for the current
toolchain boundary and rationale.

## Contributing and support

See [CONTRIBUTING.md](CONTRIBUTING.md), [SUPPORT.md](SUPPORT.md),
[SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), the
[compatibility matrix](docs/compatibility.md), and
[CI/release safety](docs/ci.md) before participating.

## License

Original project code and documentation are licensed under the MIT License.
Readium dependencies remain under their BSD 3-Clause License. See
[`NOTICE`](NOTICE) for attribution.
