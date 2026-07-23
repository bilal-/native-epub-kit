# Core accessibility and platform reliability

Status: app-ready 0.x core qualified by LIB-090.

## Outcome

Native EPUB Kit keeps publication accessibility and native text interaction in
Readium's platform WebView while exposing the state needed for an accessible,
consumer-owned reader shell. The qualified core has no known P0 or P1
accessibility, focus, input, or lifecycle defect on the app's Tier A matrix.
The package remains headless: it does not ship a toolbar, chapter drawer,
settings sheet, announcement policy, or persistence UI.

The matrix covers English LTR, Urdu and Arabic RTL, mixed bidi, native
selection, footnotes and links, page/chapter policy, native keys, phone/tablet
layouts, rotation, background/foreground transitions, navigator recreation,
source replacement, process termination, and exact locator restore.

## Ownership boundary

Readium and the native WebView own:

- semantic publication content and reading order;
- text selection, handles, system Copy, and native accessibility actions;
- platform text shaping, bidi layout, zoom, and WebView focus;
- native page/scroll rendering and accessibility traversal inside the EPUB.

Native EPUB Kit owns:

- one focusable native reader host with a consumer-supplied accessibility
  label;
- stable generation-scoped state, location, selection, footnote, link,
  decoration, image, search, and policy events;
- canonical locator restore across source, preference, and navigator changes;
- logical LTR/RTL directional-input policy and native key routing;
- bounded, rights-aware selection and note payloads; and
- deterministic cleanup when the view, activity/controller, or process
  lifecycle ends.

The consuming app owns visible controls, focus order outside publication
content, screen-reader announcements, modal focus isolation and return,
minimum target sizes, Dynamic Type/font-scale policy for app chrome, reduced
motion, persistence, and recovery UI. This separation lets an app build a
high-quality accessible product without the SDK imposing a generic visual
system.

## Publication content and selection

The native host presents the navigator as a focusable accessibility element
without flattening or replacing the WebView's semantic subtree. Generated LTR,
RTL, and mixed-script fixtures remain selectable and readable after rotation
and typography changes. Custom actions are added to the native selection menu;
system Copy remains rights-aware and platform-owned.

Selection events report logical Unicode order, conservative direction,
canonical range locators, active-handle lifecycle, and optional aggregate
reader/window geometry. Consumers can move focus to their own annotation or
sharing surface and explicitly clear selection after the interaction. See
[selection.md](selection.md) for payload bounds and geometry details.

## Focus, gestures, and keys

The reader acquires native focus on touch. Directional navigation is evaluated
in logical reading order, so physical left/right mapping reverses for RTL while
canonical forward/backward order does not. Space and arrow input follows the
same page/chapter, source-gate, and suppression policy as pointer input.

Page turns and chapter turns are independent. Same-resource pages remain
swipeable by default in paginated mode, while a resource or configured
navigation-unit crossing is rejected and restored unless chapter gestures are
enabled. Boundary candidates are enforced by the canonical locator guard on
both platforms; the wrapper does not rely on toolkit-specific wrap behavior.
Explicit contents, Previous, Next, continuation, and history commands remain
available regardless of the gesture policy. See
[navigation-policy.md](navigation-policy.md).

## Lifecycle guarantees

Every asynchronous event and command is scoped by native view `instanceId` and
publication `generation`. Replaced sources, cancelled opens, stale callbacks,
selection work, search sessions, resolved-image leases, and delayed location
events cannot become state for a newer generation.

The qualified paths cover:

| Transition                              | Core behavior                                                                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Background and foreground               | The publication session remains coherent; consumer progress controllers can flush on background.                                               |
| Rotation and size change                | The navigator remains owned once, reflows, retains typography/policy, and emits current geometry/location with honest precision.               |
| Preference or chapter-policy recreation | The current canonical locator is captured, the navigator is replaced inside the same generation, and readiness/status resumes at that locator. |
| Source replacement or remount           | The old generation is cancelled and released before the new ready generation becomes authoritative.                                            |
| Android activity recreation             | Fragment ownership is rebound without duplicate navigators or stale command acceptance.                                                        |
| Process termination                     | Durable state remains consumer-owned; a new process opens atomically at the supplied canonical locator.                                        |
| Close/dispose                           | Native publication, asset, security-scope/content-URI, search, image, and observer ownership is released exactly once.                         |

Split-view and compact-width changes use the same native size/rotation path;
the package does not assume a full-screen reader. Product chrome must still
adapt its own layout and target sizes.

## Qualified matrix

| Platform target                                   | Coverage                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone 17e simulator, iOS 26.5                    | LTR/RTL content, VoiceOver product journey, rotation, maximum Dynamic Type shell, reduced motion, selection/actions, footnotes, page/chapter policy, lifecycle and restore. |
| iPad mini (A17 Pro) simulator, iPadOS 26.5        | Tablet sizing, VoiceOver product journey, LTR/RTL, selection/actions, footnotes, rotation, background/recreation and restore.                                               |
| Dedicated Android phone AVD, Android 13 / API 33  | LTR/RTL, focused page/chapter gestures, Space-key delivery/suppression, native selection/actions, footnotes, rotation, background/recreation and restore.                   |
| Dedicated Android tablet AVD, Android 16 / API 36 | Tablet sizing, TalkBack product journey, LTR/RTL, selection/actions, footnotes, rotation, lifecycle, process restore and full catalog use.                                  |

The app-level accessibility matrix additionally verifies modal focus isolation,
focus return, 44-point/dp controls, extreme text settings, reduced motion, and
physical Previous-on-left / Next-on-right placement. Those are consumer UI
requirements rather than hidden SDK claims.

## Evidence

Source-repository evidence is retained under `artifacts/LIB-090/` and includes:

- final native unit/lint and iOS/Android example builds in `gates/`;
- iPad and Android-phone stable API, lifecycle, navigation/restore,
  typography, selection-action, footnote/link, navigation-policy, and
  hardware-key Maestro receipts in `maestro/`; and
- failure artifacts from qualification, retained to distinguish product fixes
  from test-driver/coordinate corrections.

The consuming program records its independent product evidence in
`docs/reader-modernization/evidence/APP-013-tests-accessibility-reliability.md`,
with durable process-restore evidence in APP-010 and APP-012 and the complete
252-book native catalog sweep in APP-014. LIB-090 does not treat the generic UI
track as a dependency.

## Explicit limitations

- Android fixed-layout image activation is unavailable with the pinned Readium
  integration. Capabilities report it as unsupported; reflowable images remain
  supported.
- Android's floating native `ActionMode` toolbar is system-owned and is not
  present in Maestro's application accessibility tree. Device flows assert the
  resulting public selection records; the runtime uses the native toolbar.
- The pinned native selection APIs do not expose the selected DOM node's exact
  language, so `language` is omitted instead of inferred from book metadata.
- Selection geometry is one optional aggregate range rectangle, not per-line
  client rectangles.
- Durable progress, annotations, bookmarks, preferences, and recovery policy
  are consumer-owned through the persistence/controller boundary.
- The SDK does not promise generic reader chrome, arbitrary DOM scripts, raw
  stylesheet injection, arbitrary key maps, or publication-content
  accessibility remediation.
- Tier B coverage such as broad OEM WebView variants and additional OS/device
  combinations continues after the app-ready gate; failures there must still
  be triaged, but they do not replace the defined Tier A matrix.

## Consumer checklist

Before shipping, a consumer should:

1. give the native reader a localized accessibility label;
2. provide explicit Contents, Previous, Next, and end-of-chapter controls even
   when chapter swiping is enabled;
3. keep modal focus trapped and return it to a meaningful reader control;
4. announce chapter/progress changes once, without duplicating the WebView's
   spoken content;
5. preserve minimum target sizes and test app chrome at maximum text scale;
6. respect reduced motion in consumer-owned transitions;
7. persist canonical locators through the supplied adapter/controller rather
   than native view state; and
8. test representative LTR, RTL, mixed-bidi, footnote, selection, fixed-layout,
   and image publications on every supported platform class.
