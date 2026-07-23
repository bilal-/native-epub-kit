# Changelog

## Unpublished

### 🛠 Breaking changes

### 🎉 New features

- Add validated `ReaderPreferences`, publication-aware support/applied status,
  live locator-preserving updates, and `getPreferences()` on iOS and Android.
- Add capability-aware reflowable and fixed-layout settings examples with a
  shared TypeScript/Swift/Kotlin policy contract.
- Add redaction-safe `getDiagnostics()` snapshots, deterministic issue-report
  JSON, exact native toolkit identity, staged feature availability, font
  manifest health, and a cross-platform example debug view.
- Add deterministic top-level, leaf, and explicit-depth navigation units with
  stable IDs, duplicate aliases, reading-order fallbacks, bounded diagnostics,
  coherent position paging, a pure Node-compatible helper, and
  `getNavigationUnits()` on the stable reader ref.
- Add opt-in chapter/overall progress enrichment with visible-start ownership,
  honest fallback precision, coherent event delivery, current/furthest
  controller utilities, and material reflow-stability comparison.
- Add a validated runtime navigation-input policy with separate page/chapter
  gesture gates, conservative chapter defaults, logical LTR/RTL edge and
  hardware-key handling, suppression, status reporting, and locator-preserving
  chapter-policy recreation.
- Add exact derived navigation-unit guarding with honest precision downgrade,
  previous/current/next context, direct/next/previous unit commands, rejected
  crossing events, and bounded generation-scoped jump/back history.
- Promote font delivery to a closed production config-plugin contract with
  distinct family weight/style faces, real TrueType/OpenType validation,
  project-root containment, deterministic manifests, and stale native asset,
  Xcode resource, and `UIAppFonts` reconciliation.
- Add atomic native font-manifest admission and one Readium family declaration
  containing every configured weight/style face on iOS and Android, with a
  shared three-language contract and redaction-safe runtime health/counts.
- Add a stable constrained `typographyProfile` with language, direction, and
  safe class targets; ordered installed/generic family fallbacks; bounded
  direction, line-height, and weight declarations; and exact
  preserve/hybrid/override publisher-style semantics.
- Preserve UTF-8 and UTF-16 byte order/BOM choices while transforming
  reflowable resources, fail safe on unsupported encodings, keep typography
  direction independent from navigator progression, and restore the canonical
  locator after profile changes.
- Add stable `footnotePolicy`, `linkPolicy`, `classifyFootnote`,
  `onFootnotePress`, and `onLinkPress` APIs with synchronous native semantic
  interception, conservative or declarative malformed-publisher matching,
  bounded multilingual content, canonical source/target locators, safe
  consumer downgrade, and observable external/unsupported scheme policy.
- Add stable `selectionActions`, `onSelectionAction`, and `onSelectionChange`
  APIs with rights-aware grapheme-bounded snapshots, native handle ownership,
  logical bidi text, explicit clear/dismiss lifecycle, generation identity,
  and clipped logical reader/window geometry on iOS and Android.
- Add isolated decoration groups with atomic full and ordered delta updates,
  safe package-owned highlight/underline/margin/custom styles, canonical
  activation data and geometry, and same-source navigator restoration.
- Add strict durable progress, bookmark, annotation, and scoped-preference
  records; a consumer-owned adapter contract; deterministic in-memory adapter;
  and a serial controller with atomic restore, optimistic rollback, trailing
  progress throttling, lifecycle flushes, and restart-safe furthest progress.

### 🐛 Bug fixes

- Record the exact source Locator when a native ordinary internal hyperlink is
  successfully followed, so `goBack()` and `onNavigationHistoryChange` honor
  the same documented return-history contract as ref-command jumps.
- Map automatic spread to an absent Readium Kotlin preference; passing the
  upstream `Spread.AUTO` sentinel into `EpubPreferences` throws at runtime.
- Keep iOS programmatic navigation ownership active until Readium's
  asynchronous locator delegate settles, preventing disabled user-gesture
  policy from rolling back explicit navigation commands.
- Wait for iOS Readium's ordered first stable location before installing exact
  navigation-unit boundaries, avoiding a permanent pending state when native
  publication data becomes ready first.
- Preserve system Copy when Readium Kotlin replaces the WebView action callback,
  and clean up cancelled or rights-rejected Android selection action jobs.
- Emit explicit JavaScript extensions throughout the packaged runtime and fail
  builds that would ship an extensionless Node ESM import.

### 💡 Others

- Add community onboarding with broad recipes, troubleshooting, 0.x migration
  guidance, executable README examples, generated public API inventory,
  compatibility profiles, and deterministic documentation checks.
