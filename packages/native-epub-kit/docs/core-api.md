# Core view, events, commands, and errors

## Lifecycle model

One mounted view owns one native reader instance. Each non-null source creates a
new monotonically increasing generation. State transitions are ordered:

```text
idle -> opening -> waitingForHost -> ready -> closing -> idle
                          \-> error -> closing -> idle
```

`onStateChange` emits `ready` before `onReady`, and `onError` emits before the
matching `error` state. Every event carries `instanceId`, `generation`, and a
generation-local `sequence`. Ignore data retained from an older identity.
Commands reject instead of queueing when the current generation is not ready.

Source replacement, `source={null}`, unmount, and a failed open release native
publication, asset, file/content lease, search, and resolved-image ownership.
Close is idempotent.

## View properties

| Property                              | Purpose                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `source`                              | Local publication source. `null` closes the current generation.                                   |
| `initialLocator`                      | Canonical Locator restored atomically during the next open.                                       |
| `chapterGranularity`                  | Enables derived navigation units and per-unit progress.                                           |
| `preferences`                         | Validated theme, type, layout, spread, margin, alignment, and publisher-style preferences.        |
| `navigationPolicy`                    | Page/chapter gestures, edge taps, keys, animation, and temporary directional-input policy.        |
| `typographyProfile`                   | Closed font, language/direction/class rule, line-height, weight, and surface-color profile.       |
| `footnotePolicy` / `classifyFootnote` | Native pre-navigation semantic/heuristic note decision and optional synchronous downgrade.        |
| `linkPolicy`                          | Intercept/block policy for external and unsupported schemes. Native code never opens another app. |
| `imagePolicy`                         | Consumer rights decision for publication image zoom/share materialization.                        |
| `selectionActions`                    | Up to eight localized native selection actions; system Copy remains rights-aware.                 |

The component also accepts normal React Native `ViewProps`, including `style`,
`testID`, and accessibility properties. `unstable_qualification` is reserved
for this repository's device harness and is not an application API.

## Events

| Event                       | Meaning                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `onReady`                   | The generation is ready for commands.                                                                                       |
| `onError`                   | One typed generation failure.                                                                                               |
| `onStateChange`             | Ordered lifecycle state.                                                                                                    |
| `onLocationChange`          | Canonical visible-start Locator, reason, honest precision, and optional unit/progress context. User scrolling is throttled. |
| `onNavigationUnitBoundary`  | Disabled user input attempted to leave an exact derived unit.                                                               |
| `onNavigationHistoryChange` | Bounded ephemeral jump history changed.                                                                                     |
| `onPreferencesChange`       | Requested/applied preference values and support reasons.                                                                    |
| `onNavigationPolicyChange`  | Normalized policy and live-versus-recreation application status.                                                            |
| `onFootnotePress`           | A note was prevented before navigation and resolved to bounded untrusted content.                                           |
| `onLinkPress`               | Ordinary, external, or unsupported link disposition.                                                                        |
| `onSelectionAction`         | A configured native selection action and immutable selection snapshot.                                                      |
| `onSelectionChange`         | Native selection/handle lifecycle changed or cleared.                                                                       |
| `onDecorationPress`         | A decoration and optional normalized activation geometry.                                                                   |
| `onImagePress`              | Publication image metadata, rights, geometry, and optional opaque source handle.                                            |

Location `reason` is one of `initial`, `restored`, `user-scroll`,
`programmatic`, or `preference-change`. Precision is the least precise source
actually used: `continuous`, `position`, or `resource`. Never infer precision
that the event does not claim.

## Ref commands

### Navigation and location

- `getCurrentLocation()`
- `goTo(locatorOrPublicationLink, options?)`
- `goToProgression(value, options?)`
- `goToPosition(oneBasedPosition, options?)`
- `goForward(options?)` / `goBackward(options?)`
- `getNavigationUnits(granularity?)`
- `getNavigationUnitContext()`
- `goToNavigationUnit(id, options?)`
- `goToNextNavigationUnit(options?)`
- `goToPreviousNavigationUnit(options?)`
- `getNavigationHistory()` / `goBack(options?)` /
  `clearNavigationHistory()`

Jump commands accept `history: 'push' | 'ignore'`; the defaults distinguish
jumps from sequential movement. A boolean result means observable movement,
not merely that Readium accepted a request.

### Publication and capability data

- `getPublication()` returns detached metadata, hierarchical contents, reading
  order, layout, and capabilities.
- `getPositions({ limit, offset })` returns at most 256 immutable Locators per
  page.
- `getPreferences()` and `getNavigationPolicy()` return native applied state.
- `getDiagnostics()` returns a bounded, redaction-safe support snapshot.

### Selection, decorations, images, and search

- `getCurrentSelection()` / `clearSelection()`
- `setDecorations(group, records)` / `updateDecorations(group, changes)`
- `resolveImageSource(source, 'zoom' | 'share')` /
  `releaseImageSource(id)`
- `search(query, options?)` / `getSearchPage(sessionId, cursor?)` /
  `cancelSearch(sessionId)`

Decoration groups are isolated. Replacement and delta updates validate the
whole operation atomically. Search cursors are forward-only and single-use;
one generation has one active native iterator, pages contain at most 100
results, and sessions stop at 2,000 with explicit truncation. Resolved image
files are generation-scoped and must be released as soon as the app-owned UI is
finished.

## Locators are canonical

Persist the complete Readium Locator JSON returned by the SDK. Preserve unknown
extension fields. Do not translate it to EPUB CFI, chapter index, percentage,
DOM selector, or a private wrapper format. Percentage is display state;
`initialLocator` is restoration state.

A typical application stores the latest stable Locator on throttled progress,
flushes it when the app backgrounds or reader closes, and passes it back as
`initialLocator` on the next open. Restoration is considered successful within
one stable Readium position when a platform exposes quantized position data.

## Errors

Callbacks and rejected commands use `NativeEpubKitError` with a stable
`code`, `phase`, `recoverable` flag, and safe message. Important classes
include invalid/unavailable sources, unsupported source kind, publication open,
navigator creation, invalid command arguments, not-ready/destroyed readers,
unsupported capabilities, stale generations, and native command failure.

Show recovery based on `recoverable`; do not parse message text. Source URIs,
headers, publication content, Locators, selections, native stacks, and font
paths are excluded from diagnostics by design.

## Capabilities and fixed layout

Treat `getPublication().capabilities`, preference support, navigation-policy
support, image rights, and diagnostics as authoritative. Reflow settings are
disabled for fixed-layout publications. Android fixed-layout image activation
is unavailable with the pinned toolkit and is reported rather than emulated.

Continue with [product integration patterns](product-integration.md).
