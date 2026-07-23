# Runtime navigation-input policy

Status: implemented for the 0.x SDK track.

## Outcome

Native EPUB Kit exposes one validated, controlled policy for user-driven page
and chapter movement. It separates movement inside a paginated resource from
movement across reading-order resources, keeps chapter turns off by default,
maps horizontal input through the publication's effective LTR/RTL direction,
and reports whether a change was applied live or through a locator-preserving
navigator recreation.

The policy governs directional navigation input. It does not disable ordinary
vertical scrolling inside a resource, text selection, footnote interaction, or
explicit ref commands.

## Public surface

```tsx
const [navigationPolicy, setNavigationPolicy] = useState<ReaderNavigationPolicy>({
  pageTurnGesture: 'enabled',
  chapterTurnGesture: 'disabled',
  edgeTapNavigation: false,
  hardwareKeyNavigation: true,
  animatedTransitions: false,
  inputSuppressed: false,
});

<EpubReaderView
  ref={readerRef}
  source={{ kind: 'file', uri }}
  navigationPolicy={navigationPolicy}
  onNavigationPolicyChange={(status) => {
    console.log(status.applied, status.effectiveLayout, status.application);
  }}
/>;
```

`getNavigationPolicy()` returns the latest detached status through the stable
reader ref. `normalizeReaderNavigationPolicy()` and
`readerNavigationPolicyDecision()` expose the same validation and pure
decision policy to headless controllers and tests.

## Fields and defaults

| Field                   | Default    | Meaning                                                                                                                                                   |
| ----------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageTurnGesture`       | `enabled`  | Allows a user gesture to move between pages inside the current resource when the effective layout is paginated.                                           |
| `chapterTurnGesture`    | `disabled` | Allows a user gesture or directional input to cross the current reading-order resource boundary. In scrolled layout, directional turns are chapter turns. |
| `edgeTapNavigation`     | `false`    | Enables directional horizontal edge taps. The resulting movement must still pass the page/chapter gate.                                                   |
| `hardwareKeyNavigation` | `true`     | Enables arrow and Space-key directional navigation. The resulting movement must still pass the page/chapter gate.                                         |
| `animatedTransitions`   | `false`    | Requests animation for library-issued edge/key turns. Explicit ref commands retain their own per-call `animated` option.                                  |
| `inputSuppressed`       | `false`    | Suppresses directional page/chapter input without disabling within-resource scrolling, selection, or programmatic commands.                               |

Omitted fields receive these defaults. Unknown fields, non-boolean switches,
and gesture values other than `enabled | disabled` fail synchronously before a
platform-specific fallback can be created.

The conservative product default is therefore: read and scroll normally,
swipe between pages in paginated mode, do not cross a chapter/resource by
gesture, do not turn from an accidental edge tap, and keep keyboard access
available where a keyboard is present.

## Movement classification

The same input can represent a page or chapter movement:

1. In scrolled layout, a directional turn is classified as a chapter move.
2. In paginated layout, a move inside the current resource is a page move.
3. In paginated layout, a move that changes the resource is a chapter move.
4. `inputSuppressed` wins before all individual input gates.
5. An edge tap or hardware key must pass its source gate and then the resulting
   page/chapter gate.

When `chapterGranularity` is configured, native enforcement uses the exact
derived navigation-unit intervals and reports `boundaryGranularity:
'navigation-unit'` plus its honest continuous, position, or resource precision.
During ordered installation it reports a fail-closed `pending` state. Omitting
granularity retains the reading-order-resource fallback. See the
[boundaries/history record](navigation-boundaries-history.md); this does not
redefine the navigation-unit derivation algorithm.

## Logical direction and bidi

Canonical reading order never changes for RTL. Only physical input mapping
changes:

| Input              | LTR      | RTL      |
| ------------------ | -------- | -------- |
| Right / right edge | forward  | backward |
| Left / left edge   | backward | forward  |
| Down / Space       | forward  | forward  |
| Up                 | backward | backward |

The native adapters use the effective Readium reading progression, including a
consumer preference override, and the status echoes `ltr | rtl`. A pagination
layout or progression preference change causes the status to be re-emitted
from the navigator's actual effective state instead of guessing from the
requested preferences.

## Native enforcement

Both native hosts receive the complete normalized policy in the atomic open
envelope. Readium is configured to surface resource-boundary candidates to the
wrapper instead of making the toolkit's platform-specific scroll-boundary
switch authoritative. This matters on Android, where that switch can wrap the
last paginated viewport back to the first viewport of the same resource. The
wrapper's canonical locator guard is the single enforcement point on both
platforms.

User locator changes are generation-scoped and compared with the last accepted
native locator. A disallowed same-resource paginated move or cross-resource
move is restored to the accepted locator without animation. The rejected
candidate is not emitted as an accepted stable checkpoint. Explicit `goTo`,
`goToPosition`, `goToProgression`, `goForward`, and `goBackward` commands are
marked as programmatic and remain legal regardless of the user-input policy.
On iOS the guard remains active through Readium's asynchronous delegate
settlement so a successful explicit command cannot be mistaken for a late
gesture callback.

iOS binds Readium's `DirectionalNavigationAdapter` with controlled pointer and
keyboard policies. Android uses a policy-aware `InputListener`; the native
reader view acquires focus on touch and translates Android key down/up events
to Readium key events before falling back to normal dispatch. Both adapters
apply logical LTR/RTL direction and report accepted turns as
`user-page-turn`.

## Runtime updates and status

`chapterTurnGesture` changes retain the documented `navigator-recreation`
application boundary for the stable 0.x contract. The host captures the current
canonical locator, recreates the navigator in the same publication generation,
restores that locator, and emits a new ready/status checkpoint. Candidate
enforcement itself is generation-scoped and does not depend on a toolkit-owned
gesture switch.

The other five fields apply `live`: native directional adapters are rebound or
read the new policy without recreating the publication. The status contains:

- complete normalized `requested` and `applied` policies;
- a support item for every field, including `live` versus
  `navigator-recreation` application;
- native `instanceId` and `generation` identity;
- actual `effectiveLayout` and `readingProgression`;
- boundary precision and bounded warning markers; and
- the application mode (`initial`, `live`, or `navigator-recreation`).

All six fields are supported symmetrically in this target. The parser requires
every support item exactly once and rejects a native payload that claims a
different applied policy.

## Interaction with preferences and explicit navigation

Rendering preferences and navigation input are separate controlled records.
Changing layout or progression does not mutate the requested navigation
policy, but it changes how that policy classifies the next input and therefore
causes an effective-status update.

User-input gates never replace explicit app controls. A contents view, end-of-
chapter continuation button, history back action, or accessibility action can
continue to use canonical ref commands while swiping is disabled. This is the
key product distinction between preventing accidental chapter transitions and
trapping the reader in a resource.

## Shared executable contract

`packages/testing/contracts/navigation-policy-v1/cases.json` freezes:

- all six defaults;
- scrolled chapter blocking and opt-in;
- paginated page movement and page blocking;
- paginated boundary classification;
- edge-tap and hardware-key source gates;
- suppression precedence; and
- four physical-left/right mappings across LTR and RTL.

TypeScript consumes the fixture directly and validates native status. Swift
and Kotlin tests pin the same defaults, decoding, recreation boundary, status,
and movement rejection behavior. The contract is pure and does not expose a
Readium-native preference or event type.

## Device verification

The installed example matrix proves on iOS and Android:

- conservative defaults in scrolled and paginated layouts;
- page swipe disabled/enabled behavior;
- chapter swipe default blocking and opt-in navigator recreation;
- edge taps disabled/enabled;
- full directional suppression;
- actual hardware Space-key delivery when enabled and no movement when
  disabled;
- locator preservation across policy updates;
- status coherence with effective layout/application; and
- reversed horizontal input with unchanged canonical RTL reading order.

The stable API, preferences, progress gestures, reader progress, and
navigation/restore flows are replayed after the policy matrix. In particular,
the 6/6 explicit navigation matrix proves that user blocking does not leak into
programmatic commands.

## Ownership and remaining boundaries

- The package does not persist the policy. The app owns global, per-book, and
  temporary overlay precedence.
- `inputSuppressed` is a directional-navigation gate, not a security boundary
  or a blanket interaction lock.
- Edge regions and upstream keyboard details are implementation behavior, not
  a promise that consumers can inject arbitrary gestures or key maps.
- Fixed-layout zoom, media overlays, and switch-control actions remain later
  tasks.
- Exact unit boundary events, explicit unit commands, and bounded location
  history are documented in
  [navigation-unit boundaries and history](navigation-boundaries-history.md).
