# Detailed Plan: Open-Source `native-epub-kit` Library

> Program source: the Alislam Books reader-modernization suite at
> `/Users/bilal/workspace/alislam/ebooks-reactnative/docs/reader-modernization/`.
> This repository copy becomes canonical for library implementation after its
> first reviewed push; until then, synchronize changes with the program source.

Status: implementation active; core through `LIB-062` and constrained publication colors complete
Planning baseline: 2026-07-11
Planned owner: `bilal-`

## 1. Mission

Create the best-maintained native EPUB foundation available to Expo and React
Native applications without owning an EPUB engine.

The library will wrap the official Readium Swift and Kotlin toolkits with a
small, typed, symmetric native API and headless controller. Alislam Books will
build and validate the first production UI. An optional product-quality React
Native UI kit may be extracted afterward from proven components. The core must
be useful outside Alislam Books while supporting every capability required by
that application.

The library is unofficial. It is not a Readium Foundation project and must say
so clearly in its README and package metadata.

## 2. Repository defaults

| Setting | Default |
|---|---|
| GitHub repository | `bilal-/native-epub-kit` |
| Local checkout | `/Users/bilal/workspace/personal/native-epub-kit` |
| Visibility | Public |
| Package manager | pnpm workspaces |
| Primary package | `native-epub-kit` |
| Optional UI package | Future `native-epub-ui`, extracted after app stabilization |
| License | MIT for original wrapper/UI code |
| Native dependencies | Readium BSD-3-Clause with notices retained |
| Change management | Changesets and semantic versioning |
| Initial runtime | Expo SDK 56 / React Native 0.85 |
| Initial architecture | React Native New Architecture |
| Initial platforms | iOS and Android |
| Initial format | EPUB only |

The neutral name was selected during bootstrap after Expo's official trademark
guidance ruled out using `expo` in a third-party product name. The README and
package metadata describe Expo compatibility and the Readium dependency only
descriptively, state that the project is unofficial, and use neither brand's
logos. Record any later rename before changing source paths or native module
names.

## 3. Repository structure

```text
native-epub-kit/
├── .changeset/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── pull_request_template.md
│   └── workflows/
├── apps/
│   └── example/
├── packages/
│   ├── native-epub-kit/
│   │   ├── android/
│   │   ├── ios/
│   │   ├── plugin/
│   │   ├── src/
│   │   ├── expo-module.config.json
│   │   ├── package.json
│   │   └── README.md
│   └── testing/
│       ├── fixtures/
│       ├── contracts/
│       ├── helpers/
│       └── package.json
├── docs/
│   ├── architecture/
│   ├── guides/
│   ├── recipes/
│   └── compatibility.md
├── scripts/
├── LICENSE
├── NOTICE
├── SECURITY.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

Only `native-epub-kit` is initially published. The testing workspace may remain
private to the monorepo until its API is useful to external consumers. The
optional UI workspace is added only after the Alislam app's reader UI has been
validated and an extraction review identifies genuinely reusable boundaries.

## 4. Package responsibilities

### 4.1 `native-epub-kit`

Owns:

- Expo native module registration and native view.
- Opening and closing publications.
- Readium native dependency integration.
- Cross-platform serialized models.
- Publication metadata, TOC, reading order, and positions.
- Navigation and preferences.
- Location, viewport, selection, link, footnote, image, decoration, and error
  events.
- Chapter/navigation-unit derivation and progress calculation.
- Search.
- Decoration groups.
- Capability reporting.
- Font asset config plugin and native registration.
- Headless hooks/controller that do not impose a visual design.

Does not own:

- Consumer persistence.
- Reader chrome or branded UI.
- Analytics or networking beyond sources explicitly provided by consumers.
- Catalogs, downloads, shelves, or user accounts.
- Font binaries other than clearly licensed public test/example fonts.
- Alislam-specific CSS selectors or branding.

### 4.2 Future `native-epub-ui`

This is a post-app-stabilization extraction target, not part of the first core
SDK or an app-launch dependency. The Alislam app must first prove interaction,
layout, typography, and accessibility against real publications. Extraction
starts with the smallest reusable component set and one neutral theme; it does
not generalize every visual decision in advance.

Owns optional, themeable components:

- `ReaderShell` and `ReaderProvider`.
- Collapsible header and bottom controls.
- TOC and chapter-progress browser.
- End-of-chapter continuation card.
- Settings sheet.
- Footnote sheet.
- Highlight color and note popover.
- Existing-highlight toolbar.
- Bookmark controls.
- Search sheet and result list.
- Notebook primitives.
- Text/image sharing flows and quote-card renderer.
- Image zoom viewer.
- Accessibility labels, focus management, and reduced-motion behavior.

Does not own:

- A fixed brand.
- A database implementation.
- A navigation library requirement beyond narrow adapters.
- A single bottom-sheet dependency that consumers cannot replace.

### 4.3 `testing`

Owns:

- Generated/public EPUB fixtures.
- TypeScript event goldens.
- Native contract fixtures.
- Fake reader engine and in-memory persistence adapters.
- Consumer test helpers.
- Scripts to build fixtures from source directories.
- Performance and visual test book generators.

## 5. Supported environment policy

The first alpha optimizes for the consuming app rather than claiming broad
compatibility prematurely.

Initial supported matrix:

- Expo SDK 56.
- React Native 0.85.
- New Architecture enabled.
- iOS minimum 15 unless qualification identifies a stricter Readium minimum.
- Android minimum API 24 unless qualification identifies a stricter minimum.
- Xcode, Swift, Kotlin, Gradle, JDK, compile SDK, and CocoaPods versions required
  by the exact Expo and Readium revisions.

Before 1.0, add the immediately previous supported Expo SDK when practical.
Bare React Native applications may use the module by installing Expo Modules
Core, but bare-RN documentation is deferred until the Expo integration is
stable. Web is explicitly unsupported in 1.0 and receives a clear runtime/build
error or inert typed stub rather than a misleading partial reader.

## 6. Native dependency strategy

### 6.1 Exact pins

Never use floating native Readium ranges. Record exact versions or commits in:

- The podspec/Swift dependency integration.
- Android Gradle dependencies.
- `docs/compatibility.md`.
- The generated diagnostics payload.

Planning baseline:

- Swift Toolkit 3.10.0.
- Kotlin Toolkit 3.3.0.
- Swift custom-font fix merged in Readium PR 845 after 3.10.0.

Qualification chooses either the next Swift tag containing that fix or an exact
upstream commit for internal alpha use. No fork is created.

### 6.2 Upgrade procedure

Every Readium upgrade is an isolated change that:

1. Reads the upstream changelog and migration guide.
2. Updates one platform at a time only inside the upgrade branch, while the PR
   remains incomplete until both platforms pass.
3. Regenerates contract fixtures if upstream serialized output legitimately
   changes.
4. Runs public fixtures on both platforms.
5. Runs the private Alislam production catalog suite.
6. Compares typography and reader screenshots.
7. Verifies persisted locator compatibility.
8. Updates compatibility documentation and Changesets.

No feature work is bundled into a native dependency upgrade.

### 6.3 Upstream contribution policy

If a required hook is absent:

1. Confirm the capability is not already public.
2. Build the smallest general-purpose change possible.
3. Open an upstream issue or proposal.
4. Submit the change upstream when appropriate.
5. Keep any temporary compatibility code isolated behind one native adapter.
6. Delete it when the upstream release is adopted.

The project does not carry modified copies of Readium source trees.

## 7. Core domain types

All public payloads must be JSON-serializable and represented by equivalent
Swift, Kotlin, and TypeScript records.

### 7.1 Source

```ts
export type PublicationSource =
  | { kind: 'file'; uri: string }
  | { kind: 'content'; uri: string }
  | { kind: 'remote'; url: string; headers?: Record<string, string> };
```

Remote sources may remain experimental initially. Local file opening is the
required path for 1.0.

### 7.2 Locator

Use the Readium locator model without inventing a competing location format:

```ts
export interface Locator {
  href: string;
  type: string;
  title?: string;
  locations?: {
    fragments?: string[];
    progression?: number;
    position?: number;
    totalProgression?: number;
    [key: string]: unknown;
  };
  text?: {
    before?: string;
    highlight?: string;
    after?: string;
  };
}
```

The actual exported type must track the current official model, preserve
unknown extensions, and use a schema/version marker at storage boundaries.

### 7.3 Geometry

```ts
export interface ReaderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReaderGeometry {
  viewRect?: ReaderRect;
  windowRect?: ReaderRect;
  coordinateSpace: 'reader-view-and-window-v1';
  viewport: { width: number; height: number };
}
```

Both rectangles are valuable: view coordinates support overlays inside the
reader shell; window coordinates support portals and root-level popovers.

### 7.4 Publication summary

```ts
export interface PublicationSummary {
  identifier?: string;
  title: string;
  subtitle?: string;
  authors: Contributor[];
  languages: string[];
  readingProgression?: 'ltr' | 'rtl' | 'ttb' | 'btt' | 'auto';
  tableOfContents: PublicationLink[];
  readingOrder: PublicationLink[];
  positions: Locator[];
  layout: 'reflowable' | 'fixed';
  capabilities: PublicationCapabilities;
}
```

Large position arrays may be delivered through an async method instead of a
single view event if profiling shows event size to be harmful.

### 7.5 Navigation units

```ts
export interface NavigationUnit {
  id: string;
  title: string;
  href: string;
  depth: number;
  parentId?: string;
  childIds: string[];
  source: 'toc' | 'reading-order-fallback';
  startLocator: Locator;
  endLocator?: Locator;
  startPosition?: number;
  endPositionExclusive?: number;
  startTotalProgression?: number;
  endTotalProgression?: number;
}

export type ChapterGranularity = 'top-level' | 'leaf' | { depth: number };
```

The library exposes both the original TOC and derived navigation units. It does
not relabel every TOC node as a chapter.

### 7.6 Location event

```ts
export interface ReaderLocationEvent {
  locator: Locator;
  visibleRange?: {
    start: Locator;
    end: Locator;
  };
  navigationUnit?: NavigationUnit;
  chapterProgress?: number;
  overallProgress?: number;
  position?: number;
  totalPositions?: number;
  reason:
    | 'initial'
    | 'user-scroll'
    | 'user-page-turn'
    | 'programmatic'
    | 'preference-change'
    | 'restored';
  precision: 'continuous' | 'position' | 'resource';
}
```

Reason and precision prevent consumers from guessing why values moved or how
exactly they should be displayed.

### 7.7 Selection

```ts
export interface ReaderSelection {
  locator: Locator;
  text: string;
  copyAllowed?: boolean;
  truncated?: boolean;
  geometry?: ReaderGeometry;
  language?: string;
  direction?: 'ltr' | 'rtl' | 'auto';
  navigationUnitId?: string;
}

export type SelectionActionId = 'highlight' | 'note' | 'share' | string;

export interface ReaderSelectionAction {
  id: SelectionActionId;
  title: string;
}

export interface ReaderSelectionSnapshot extends ReaderSelection {
  copyAllowed: boolean;
  truncated: boolean;
}

export interface ReaderSelectionChangeEvent {
  instanceId: string;
  generation: number;
  sequence: number;
  platform: 'ios' | 'android';
  handlesActive: boolean;
  reason: 'started' | 'changed' | 'cleared' | 'dismissed';
  selection: ReaderSelectionSnapshot | null;
}

export interface ReaderSelectionActionEvent {
  instanceId: string;
  generation: number;
  sequence: number;
  platform: 'ios' | 'android';
  handlesActive: boolean;
  actionId: SelectionActionId;
  selection: ReaderSelectionSnapshot;
}
```

Custom action IDs let consumers add actions such as Define, Search Book, Copy
Reference, or Translate without modifying native code for each product.
Language is emitted only when the native selected-node source provides it
exactly; publication metadata is never substituted for mixed-script content.

### 7.8 Decorations

```ts
export interface ReaderDecorationCustomConfig {
  tint?: string;
  borderRadius?: number;
  borderWidth?: number;
  fillOpacity?: number;
  isActive?: boolean;
}

export interface ReaderDecoration {
  id: string;
  locator: Locator;
  style:
    | { type: 'highlight'; tint: string; isActive?: boolean }
    | { type: 'underline'; tint: string; isActive?: boolean }
    | { type: 'margin-icon'; asset: 'bookmark' | 'note'; tint?: string }
    | {
        type: 'custom';
        template: 'rounded-box-v1';
        config?: ReaderDecorationCustomConfig;
      };
  data?: JsonValue;
}

export type ReaderDecorationChange =
  | { type: 'add' | 'update'; decoration: ReaderDecoration }
  | { type: 'remove'; id: string };

export interface ReaderDecorationActivationEvent {
  instanceId: string;
  generation: number;
  sequence: number;
  platform: 'ios' | 'android';
  group: string;
  decoration: ReaderDecoration;
  geometry?: ReaderGeometry;
}
```

Decoration groups isolate `annotations`, `search`, `tts`, and transient UI so
one feature never clears another feature's visuals. Full and delta updates use
explicit ref commands; there is no large `decorations` React prop. Styles use
only package-owned assets and templates, bounded numeric configuration, and
hex colors. Raw CSS, HTML, JavaScript, URLs, and arbitrary assets are excluded.
The exact limits, lifecycle, and activation semantics are recorded in
`docs/architecture/decorations.md`.

### 7.9 Footnote

```ts
export interface FootnoteEvent {
  id?: string;
  sourceLocator: Locator;
  targetLocator?: Locator;
  href: string;
  referrer?: string;
  contentType?: string;
  html?: string;
  text: string;
  language?: string;
  direction?: 'ltr' | 'rtl' | 'auto';
  geometry?: ReaderGeometry;
  classification: 'semantic' | 'heuristic';
}
```

The HTML is sanitized or constrained before entering the generic UI. Plain text
is always present as an accessible fallback.

### 7.10 Errors

```ts
export interface ReaderError {
  code: ReaderErrorCode;
  phase: 'source' | 'open' | 'render' | 'navigate' | 'search' | 'resource' | 'close';
  message: string;
  recoverable: boolean;
  publicationUri?: string;
  nativeDetails?: JsonValue;
}
```

Stable initial error families:

- `SOURCE_NOT_FOUND`.
- `SOURCE_PERMISSION_DENIED`.
- `UNSUPPORTED_FORMAT`.
- `PUBLICATION_OPEN_FAILED`.
- `PUBLICATION_PROTECTED`.
- `NAVIGATOR_CREATION_FAILED`.
- `RESOURCE_LOAD_FAILED`.
- `INVALID_LOCATOR`.
- `NAVIGATION_FAILED`.
- `SEARCH_FAILED`.
- `READER_DESTROYED`.
- `NATIVE_INVARIANT_VIOLATION`.

Native stack details are diagnostic, not part of control flow.

## 8. Proposed React API

### 8.1 Core view

```tsx
const ref = useRef<EpubReaderViewRef>(null);

<EpubReaderView
  ref={ref}
  source={{ kind: 'file', uri: localEpubUri }}
  initialLocator={savedLocator}
  preferences={preferences}
  navigationPolicy={{
    layout: 'scrolled',
    pageTurnGesture: 'enabled',
    chapterTurnGesture: 'disabled',
    edgeTapNavigation: false,
  }}
  chapterGranularity="top-level"
  selectionActions={[
    { id: 'highlight', title: 'Highlight' },
    { id: 'note', title: 'Note' },
    { id: 'share', title: 'Share Quote' },
  ]}
  onReady={handleReady}
  onLocationChange={handleLocationChange}
  onSelectionAction={handleSelectionAction}
  onDecorationPress={handleDecorationPress}
  onFootnotePress={handleFootnotePress}
  onError={handleError}
/>
```

Large or high-frequency state such as decorations should use explicit ref
methods or a controller rather than forcing large React prop reconciliation on
every small update. The Phase 0/2 performance work decides the final split.

### 8.2 Imperative ref

```ts
export interface EpubReaderViewRef {
  goTo(target: Locator | PublicationLink, options?: NavigationOptions): Promise<boolean>;
  goToProgression(progression: number, options?: NavigationOptions): Promise<boolean>;
  goToPosition(position: number, options?: NavigationOptions): Promise<boolean>;
  goToNavigationUnit(id: string, options?: NavigationOptions): Promise<boolean>;
  goForward(options?: NavigationOptions): Promise<boolean>;
  goBackward(options?: NavigationOptions): Promise<boolean>;
  goToNextNavigationUnit(options?: NavigationOptions): Promise<boolean>;
  goToPreviousNavigationUnit(options?: NavigationOptions): Promise<boolean>;
  getCurrentLocation(): Promise<ReaderLocationEvent | null>;
  getCurrentSelection(): Promise<ReaderSelection | null>;
  clearSelection(): Promise<void>;
  setDecorations(group: string, decorations: ReaderDecoration[]): Promise<void>;
  updateDecorations(group: string, changes: DecorationChange[]): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<SearchSession>;
  getSearchPage(sessionId: string, cursor?: string): Promise<SearchPage>;
  cancelSearch(sessionId: string): Promise<void>;
}
```

All native view operations are async and reject with typed reader errors when
the view is not ready or has been destroyed.

### 8.3 Headless controller

`useEpubReader` coordinates the view, persistence, annotations, history, and
UI state without rendering a fixed shell:

```ts
const reader = useEpubReader({
  publicationId,
  source,
  persistence,
  preferences,
  chapterGranularity: 'top-level',
});
```

The controller exposes readiness, publication, location, navigation units,
selection, active footnote, annotations, bookmarks, search, commands, and
recoverable errors. It must use selectors or split contexts so high-frequency
location changes do not rerender the entire reader shell.

## 9. iOS implementation plan

### 9.1 View ownership

- `NativeEpubView` subclasses `ExpoView`.
- A dedicated child `UIViewController` owns `EPUBNavigatorViewController`.
- Parent/child controller containment is established and removed correctly.
- Publication opening runs asynchronously and is cancellation-aware.
- Every source change closes and releases the previous publication before a new
  navigator becomes active.
- View destruction cancels tasks, unregisters observers, closes publication
  resources as required by the pinned toolkit, and prevents late events.

### 9.2 Native services

Separate classes/protocols:

- `PublicationSession`: source retrieval, open, metadata, and close.
- `NavigatorHost`: view-controller containment and navigator lifecycle.
- `EventMapper`: Readium models to shared serialized records.
- `NavigationUnitBuilder`: native or shared algorithm input mapping.
- `SelectionCoordinator`: actions, selection state, and geometry.
- `LinkCoordinator`: footnotes, internal links, external links, and history.
- `DecorationCoordinator`: group state and activation.
- `SearchCoordinator`: session lifecycle and pagination.
- `FontRegistry`: config-plugin assets and font declarations.

### 9.3 Selection

- Configure Readium `EditingAction`s for consumer actions.
- Retrieve `currentSelection` only at action time or when selection changes.
- Preserve the selection frame and convert it to both reader-view and window
  coordinates.
- Do not clear the selection automatically after emitting an action.
- Clear only when JavaScript commands it or native selection is dismissed.
- Emit null selection when handles disappear.

### 9.4 Footnotes and links

Implement the Readium navigator delegate callback for note navigation. Return
the value that prevents default navigation when the policy says to emit a
footnote. Normalize content and emit the shared payload. Ordinary links retain
default navigation or pass through consumer policy as appropriate.

### 9.5 Viewport and progress

Use the current Swift viewport-observing APIs when available. Emit a throttled
visible range and continuous progress. Preference changes are tagged so
consumers do not mistake layout recalculation for user navigation.

## 10. Android implementation plan

### 10.1 View and Fragment ownership

- `NativeEpubView` subclasses Android `ExpoView`.
- A dedicated host `Fragment` contains `EpubNavigatorFragment`.
- Use the appropriate FragmentManager from the current activity.
- Assign Readium's FragmentFactory before restoration.
- Use stable tags and unique IDs for multiple reader instances.
- Handle saved instance state, activity recreation, view detach/reattach, and
  process restoration without orphan fragments.
- Destroy the navigator/session when the Expo view is destroyed.

The lifecycle proof is a Phase 0 blocker because Fragment ownership is the most
platform-specific part of the wrapper.

### 10.2 Native services

Mirror iOS responsibilities:

- `PublicationSession`.
- `NavigatorHostFragment`.
- `EventMapper`.
- `SelectionCoordinator`.
- `HyperlinkCoordinator`.
- `DecorationCoordinator`.
- `SearchCoordinator`.
- `FontRegistry`.

Names may follow Kotlin conventions, but ownership must remain visibly parallel
in code and documentation.

### 10.3 Selection

- Supply a custom ActionMode callback through Readium configuration.
- Add consumer actions without removing appropriate system actions.
- Retrieve the current `Selection`, including `rect`.
- Normalize geometry to view and window coordinates.
- Avoid fixed-interval polling when lifecycle callbacks or flows can provide the
  state. If polling is unavoidable for a toolkit limitation, scope and suspend
  it with the view lifecycle and document its cost.
- Do not clear selection until commanded.

### 10.4 Footnotes and links

Pass an `EpubNavigatorFragment.Listener` when creating the fragment factory.
Implement `HyperlinkNavigator.Listener.shouldFollowInternalLink` and detect
`FootnoteContext`. Return false when emitting the sheet event. External links
are emitted rather than automatically launched unless consumer policy says
otherwise.

### 10.5 Progress fallback

If Kotlin does not expose the same continuous viewport data as Swift, derive the
best value from the current locator and position list and mark its precision.
The TypeScript API remains stable while the implementation can improve with
future toolkit releases.

## 11. Publication lifecycle state machine

The native view uses an explicit state machine:

```text
idle
  -> opening(source, generation)
  -> ready(publication, navigator, generation)
  -> closing(generation)
  -> idle

opening -> failed(error) -> idle
ready   -> failed(error) -> closing -> idle
```

Rules:

- Every source assignment increments a generation ID.
- Async completion for an old generation is ignored and cleaned up.
- Commands in `opening` reject with `READER_NOT_READY` or wait only if the API
  explicitly promises queuing.
- Commands in `closing` or after destruction reject.
- `onReady` emits once per successful generation.
- Errors emit once with phase and recoverability.
- A publication is never shared across unrelated view generations.
- Cleanup is idempotent.

## 12. Navigation-unit algorithm

Implement the deterministic algorithm in shared TypeScript where possible so it
can be unit-tested without native devices. Native supplies TOC, reading order,
positions, and resolved locators.

Algorithm:

1. Normalize HREFs without discarding fragments.
2. Flatten the TOC while preserving path, depth, parent, child order, and source
   order.
3. Resolve every link to a locator and best available global position.
4. Select candidate entries according to granularity:
   - `top-level`: depth zero entries.
   - `leaf`: entries without children.
   - explicit depth: entries at that depth, with sensible handling when a branch
     is shallower.
5. Remove exact duplicate boundaries while retaining aliases for display.
6. Sort by publication reading order and location within each resource.
7. Set each unit's end to the next unit's start; the final unit ends at the
   publication end.
8. Detect uncovered reading-order resources and insert fallback units.
9. Assign stable IDs derived from TOC path plus normalized target, not array
   index alone.
10. Produce diagnostics for unresolved, out-of-order, duplicate, and empty
    units.

Current unit selection:

- Prefer the deepest matching TOC node for display.
- Use the selected navigation-unit interval for progress and next/previous.
- Resolve boundary ambiguity consistently: start is inclusive, end is
  exclusive, except publication end.

Progress:

- Prefer continuous total progression when available.
- Otherwise use stable position.
- Otherwise use resource index plus resource progression.
- Clamp values to `[0, 1]` and include precision.
- Never calculate overall progress as an unweighted average of chapters.

## 13. Navigation and gesture policy

```ts
export interface NavigationPolicy {
  layout: 'scrolled' | 'paginated';
  pageTurnGesture: 'enabled' | 'disabled';
  chapterTurnGesture: 'enabled' | 'disabled';
  edgeTapNavigation: boolean;
  animatedTransitions: boolean;
}
```

Required behavior:

- Scrolled plus chapter gesture disabled: vertical content scrolls, horizontal
  cross-resource turns are blocked.
- Paginated plus chapter gesture disabled: page turns within a navigation unit
  work; crossing the unit boundary emits `onChapterBoundary` instead.
- Enabling chapter gesture allows the logical forward/back transition.
- Logical direction respects publication reading progression.
- Selection, footnote, image zoom, and active sheets suppress conflicting
  navigation gestures.
- Hardware keys and edge taps run through the same policy.

## 14. Fonts, styles, and config plugin

### 14.1 Consumer configuration

Proposed app config:

```json
[
  "native-epub-kit",
  {
    "fonts": [
      {
        "family": "ExampleBody",
        "sources": [
          { "path": "./assets/fonts/Body-Regular.ttf", "weight": 400 },
          { "path": "./assets/fonts/Body-Bold.ttf", "weight": 700 }
        ]
      }
    ]
  }
]
```

The config plugin:

- Validates paths and duplicate family names.
- Copies assets into deterministic iOS and Android locations.
- Updates iOS font/resource configuration as needed.
- Copies Android assets under a stable served-assets path.
- Generates a manifest consumed by native `FontRegistry` implementations.
- Is idempotent under repeated `expo prebuild`.
- Emits actionable errors for missing files or unsupported formats.
- Never downloads fonts during build.

### 14.2 Runtime typography profile

```ts
export interface TypographyProfile {
  colors?: ReaderColorProfile;
  defaultFontFamilies?: string[];
  publisherStyles: 'preserve' | 'hybrid' | 'override';
  rules?: TypographyRule[];
}

export interface ReaderColorProfile {
  background: `#${string}`;
  link: `#${string}`;
  text: `#${string}`;
}

export interface TypographyRule {
  target: TypographyRuleTarget;
  color?: `#${string}`;
  fontFamilies?: string[];
  direction?: 'ltr' | 'rtl';
  lineHeight?: number;
  fontWeight?: number;
}
```

Rules can target safe selectors such as language, direction, and consumer-known
classes. Arbitrary script injection is not part of the public API. Any custom
stylesheet mechanism must be constrained, documented, and tested so it cannot
break Readium navigation, selection, or locator stability.

The implemented color model accepts only exact `#RRGGBB` background, text,
link, and targeted rule colors. TypeScript, Swift, and Kotlin reject unknown
keys and compile the same deterministic declarations. Library-owned rooted
specificity guards beat Readium's document-wide text inheritance and night
link rules without changing match sets or accepting consumer selector syntax,
URLs, custom properties, raw CSS, or script.

This mechanism is a qualification requirement, not a Phase 4 assumption. Phase
0 must prove on both platforms that supported Readium APIs or a safe constrained
integration can apply `:lang(...)`, direction, and known-class rules while
preserving selection geometry and locator stability. It must also prove the
publisher `preserve`/`hybrid`/`override` policy is technically expressible. If
not, the public typography API must be redesigned before GATE-Q passes.

### 14.3 Fixed layout

Font and reflow preferences do not apply to fixed-layout publications. The
capability model and settings UI must disable incompatible controls rather than
pretending they succeeded.

## 15. Footnote classification

Order of evidence:

1. Native Readium footnote context.
2. EPUB semantic link/target types.
3. Consumer-provided classifier.
4. Optional conservative heuristic mode.

Heuristics may consider target fragment, target role/type, backlink patterns,
and note container semantics. A simple same-document fragment link is not
automatically a footnote.

Policies:

```ts
type FootnotePolicy =
  | { mode: 'navigate' }
  | { mode: 'semantic' }
  | { mode: 'semantic-and-heuristic' };
```

The event must arrive before default navigation. If an async JavaScript callback
cannot synchronously cancel native behavior, the native policy decides whether
to emit or navigate; it never waits for JavaScript to answer synchronously.

## 16. Selection and annotation lifecycle

State flow:

```text
no selection
  -> native selection active
  -> action emitted with selection and geometry
  -> React Native popover open
  -> save/share/dismiss
  -> explicit clearSelection
  -> no selection
```

Existing decoration flow:

```text
decoration activated
  -> event with id, locator, and geometry
  -> React Native edit toolbar
  -> update/delete/share/dismiss
  -> decoration delta applied
```

Important rules:

- Preserve locator text context.
- Preserve logical text order for bidirectional selections.
- Do not cut grapheme clusters.
- Respect copy restrictions for protected publications.
- Cap or reject unreasonably large selection payloads with a documented policy.
- Keep decoration IDs unique within a group.
- Support delta updates to avoid resending thousands of annotations.

## 17. Search design

Search is session-based because large publications can return many results and
users may replace queries quickly.

Requirements:

- Open, page, and cancel a search session.
- Result locator, excerpt, resource title, and navigation-unit context.
- Cancellation when query changes or view closes.
- Search decoration group independent of annotations.
- Current result styling distinct from all-result styling.
- Navigation to a result and Back to Previous Location.
- Empty, unsupported, failed, and cancelled states.
- No unbounded result accumulation in memory.

## 18. Post-app UI kit extraction design

This section describes the intended extraction target after the app reader has
stabilized. It does not impose generic-first acceptance gates on app 1.0.

Extraction entry criteria:

- Alislam reader interactions have passed the catalog and device matrices.
- Component boundaries have remained stable through at least one release
  candidate cycle.
- The extraction reduces duplication for a second neutral example or consumer.
- App-specific branding and persistence are demonstrably separable.
- Core APIs do not need to become UI-specific to support the extraction.

### 18.1 Theme contract

Expose semantic tokens rather than hardcoded component colors:

- Background, surface, elevated surface.
- Primary/secondary text.
- Heading text.
- Accent and on-accent.
- Border and separator.
- Scrim.
- Highlight palette.
- Footnote and selection affordances.
- Spacing, radii, shadows, and motion durations.
- Script-specific UI and content fonts.

### 18.2 Component composability

The initial extraction should export only proven components. A later
`ReaderShell` may compose defaults, and consumers can replace components as
actual use cases justify. Candidate boundaries include:

- Header.
- Footer.
- TOC.
- Settings.
- Footnote renderer.
- Selection toolbar.
- Share composer.
- Image viewer.
- Notebook.

Stateful controllers and presentational components are separated so apps can
reuse behavior with custom design.

### 18.3 Dependency policy

Keep peer dependencies small. Prefer React Native and Expo primitives. If the UI
kit uses Reanimated, Gesture Handler, View Shot, Expo Sharing, or a bottom-sheet
package, declare and document peer dependencies and provide graceful component
boundaries. The core native package must not depend on sharing or UI libraries.

## 19. Persistence interfaces

```ts
export interface ReaderPersistenceAdapter {
  loadReadingState(publicationId: string): Promise<StoredReadingState | null>;
  saveReadingState(publicationId: string, state: StoredReadingState): Promise<void>;
  listBookmarks(publicationId: string): Promise<ReaderBookmark[]>;
  saveBookmark(bookmark: ReaderBookmark): Promise<void>;
  deleteBookmark(publicationId: string, bookmarkId: string): Promise<void>;
  listAnnotations(publicationId: string): Promise<ReaderAnnotation[]>;
  saveAnnotation(annotation: ReaderAnnotation): Promise<void>;
  deleteAnnotation(publicationId: string, annotationId: string): Promise<void>;
  loadPreferences(scope: PreferenceScope): Promise<ReaderPreferences | null>;
  savePreferences(scope: PreferenceScope, preferences: ReaderPreferences): Promise<void>;
}
```

The controller serializes writes per publication, throttles high-frequency
progress updates, flushes on background/close, and surfaces persistence errors
without crashing the native navigator.

The implemented 0.x contract uses schema-v1 detached progress, canonical UTC
timestamps, bounded deterministic bookmark/annotation lists, and closed
global/publication preference scopes. `createReaderPersistenceController()`
restores all domains atomically, exposes optimistic entity state, rolls back
only failed writes while preserving later queued intent, coalesces progress,
and drains in-flight progress at lifecycle flushes. The package's
`InMemoryReaderPersistenceAdapter` is explicit and ephemeral; production
storage remains wholly consumer-owned. See `persistence.md` for the exact
record, bound, error, and destruction semantics.

## 20. Testing plan

### 20.1 TypeScript

- Domain record validation and serialization.
- Navigation-unit derivation.
- Progress calculation at every boundary.
- RTL logical forward/back mapping.
- Persistence controller throttling and flushing.
- Search sessions.
- UI reducers and overlay placement.
- Fake-engine consumer tests.

### 20.2 Swift

- Record mapping and unknown-field behavior.
- Lifecycle state machine and cancellation.
- Geometry conversion.
- Link/footnote policy.
- Error mapping.
- Font manifest parsing.
- Decoration delta mapping.
- Search cancellation.

### 20.3 Kotlin

Mirror the Swift test categories, plus:

- Fragment creation/restoration.
- View destruction and observer cancellation.
- Activity recreation.
- ActionMode integration.
- Content URI behavior.

### 20.4 Contract tests

The same JSON fixtures are decoded and encoded by TypeScript, Swift, and Kotlin.
Tests fail when a platform omits, renames, changes units, or changes nullability
for a shared field.

### 20.5 End-to-end journeys

- Open and restore.
- Change font/theme without losing place.
- Scroll to chapter end and continue.
- Enable and disable chapter swipe.
- Open and dismiss a footnote.
- Follow a link and return.
- Select text, highlight, annotate, edit, recolor, share, and delete.
- Bookmark and return.
- Search and navigate results.
- Rotate and background during each overlay.
- Kill and relaunch the example app.

### 20.6 Performance tests

- Cold and warm publication open.
- Large TOC/position mapping.
- Location event rate.
- 100, 500, 2,000, and 10,000 decorations.
- Search cancellation and repeated queries.
- Repeated source replacement and view destruction.
- Memory after 20 open/close cycles.
- Share-card generation with long RTL text.

## 21. CI and release automation

Required workflows:

### Pull requests

- Install with frozen lockfile.
- Formatting/linting.
- TypeScript typecheck and unit tests.
- Package build and export validation.
- Android native unit tests and example debug build.
- iOS native unit tests and example simulator build.
- Public fixture smoke tests where runner capability permits.
- License and dependency audit.
- Changeset requirement for publishable changes.

### Main branch

- All PR checks.
- Example artifact build.
- Documentation link check.
- Compatibility report.
- Optional nightly device/corpus workflow.

### Release

- Changesets creates version PR.
- Exact package contents are inspected with `pnpm pack`.
- Clean consumer fixture installs packed tarballs.
- npm provenance and GitHub release notes when supported.
- Tag matches package version.
- `latest` is reserved for stable; alpha/beta use dist-tags.

No release workflow auto-upgrades native dependencies.

## 22. Documentation deliverables

### 22.1 App-ready core `0.x`

Before the app ships, documentation must cover the supported app path:

- Exact Expo/React Native/Readium compatibility.
- Installation and config plugin.
- Local EPUB source and lifecycle.
- Core events, commands, capabilities, and errors.
- Locators, progress, chapters, fonts, footnotes, selection, decorations,
  search, persistence interfaces, and diagnostics.
- A core example sufficient to reproduce app-relevant behavior.
- Known limitations and upgrade pinning.

This is a launch gate. It does not require community tutorials for every UI
composition or a generic full-reader design system.

### 22.2 Community-ready core/UI `1.0`

Before 1.0:

- Five-minute Expo setup.
- Bare RN setup or explicit unsupported statement.
- Native compatibility matrix.
- Core-only example.
- Full UI-kit example if the optional package has been extracted.
- Local file and content URI recipes.
- Progress and resume.
- Chapters and gesture policy.
- Fonts and typography profiles.
- Footnotes and links.
- Highlights, notes, and bookmarks.
- Search.
- Sharing.
- Persistence adapter.
- Error handling and diagnostics.
- Accessibility guidance.
- Upgrade guide.
- Troubleshooting guide.
- Architecture and lifecycle explanation.

Every public API needs TypeDoc or equivalent generated reference plus a tested
recipe. README snippets should be executed by a documentation test where
practical.

## 23. Security, privacy, and rights

- No telemetry or network calls by default.
- Remote source headers must not appear in logs or error payloads.
- Sanitize footnote HTML and external URLs before generic UI rendering.
- Respect Readium copy restrictions and consumer share policies.
- Do not expose arbitrary JavaScript injection into publication WebViews.
- Validate config-plugin file paths remain within expected project roots.
- Run dependency review and secret scanning.
- Publish a security-reporting policy.
- Keep copyrighted fixtures and uncertain-license fonts out of the public repo.

## 24. Release definitions

### 24.1 App-ready core beta

The app-ready core may remain `0.x`. It is ready to support Alislam Books 1.0
when:

- Required native APIs are stable for the app and pinned exactly.
- Both platforms pass functional, lifecycle, RTL, font, footnote, selection,
  decoration, search, and progress gates.
- The private 252-book sweep and deep language subsets pass.
- Crash-free reliability, accessibility blockers, and agreed performance
  budgets pass on the app's supported device matrix.
- The package installs reproducibly without a private patch or absolute local
  path.
- Core setup and API documentation required by the app is complete.
- The ebooks app has consumed the exact candidate successfully.

Community governance polish, broad recipes, generic UI extraction, and a large
cross-consumer compatibility matrix do not block this gate.

### 24.2 Community-ready library 1.0

Library 1.0 is ready only when:

- Public APIs are documented and reviewed.
- Both platforms implement every required capability or a documented fallback.
- No unresolved P0 or P1 issues remain.
- All required public fixtures pass.
- The complete Alislam catalog passes app-level smoke tests.
- Targeted font and bidi automated/manual baselines pass on fixed reference
  configurations; flaky cross-device WebView screenshot automation is not
  itself a blocker when equivalent reviewed evidence exists.
- Footnotes, selection geometry, and annotations pass real-device tests.
- Accessibility checklist passes on iOS and Android.
- Performance budgets pass or have explicitly accepted measured revisions.
- The example app demonstrates every required core feature and, if published,
  every extracted UI feature.
- Packed packages install in a clean Expo consumer.
- License and notice files are complete.
- At least one release candidate has been consumed by the ebooks app without a
  private patch.
- Breaking changes and migration notes from all alphas are consolidated.

## 25. Deliverable handoff to the library repository

During bootstrap, copy this plan to `docs/architecture/product-plan.md` in the
new repository. After that copy lands, library-specific implementation updates
must be made there first. The ebooks copy remains a program snapshot and should
link to the canonical GitHub document once available.
