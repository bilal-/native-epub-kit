# Troubleshooting

Start with the smallest generated/public EPUB that reproduces the problem. Keep
the app's catalog, network, database, and presentation layers out of the first
test. Capture stable error codes plus `getDiagnostics()`; never attach private
book content, source URLs, Locators, selections, credentials, or font paths.

## The native module is missing

Symptoms include an unavailable native view, Expo Go errors, or a JavaScript
module that imports but cannot render.

1. Confirm this is a development/release build, not Expo Go.
2. Confirm `native-epub-kit` is in the Expo `plugins` array.
3. Re-run `npx expo prebuild --clean` after installing or changing the package.
4. Verify only one installed package and one Readium graph exist.
5. Rebuild the native app; Metro reload alone cannot add Swift/Kotlin code.

Bare React Native manual setup is not a supported 0.x path.

## The reader is blank or never becomes ready

- Keep explicit loading, ready, recoverable-error, and fatal-error states around
  the view; do not infer readiness from mount.
- Inspect `onStateChange` ordering and the matching generation identity.
- Use a readable local `file:` URI or an Android `content:` URI with an existing
  grant. Remote sources are rejected before networking.
- Close the active source before replacing/deleting its file.
- Run the same file through EPUBCheck. Publisher-content errors can be retained
  catalog debt even when the SDK fails safely.
- Do not issue commands before `onReady`; they reject rather than queue.

If the lifecycle is stuck after a source replacement, capture state events for
both generations. Stale async results must be discarded by `instanceId` and
`generation`.

## Android reports a Fragment or host error

The qualified path uses one reader per Expo-generated `FragmentActivity` and
`MainActivity.onCreate(null)`. Simultaneous readers and custom activities that
restore publication-bound fragments are not supported yet.

Unmount the old reader before mounting another. Do not manually add a second
Readium fragment. If a command targets a fragment anchor, completion means the
requested target is visibly settled; capture the command error and diagnostics
if a malformed publisher target never becomes visible.

## A saved position restores imprecisely

Persist the complete Locator JSON returned by the SDK, including unknown
extension fields. Do not save only percentage, chapter index, fragment, DOM
selector, or CFI. Check the location event's `precision`: Android may expose
position/resource precision where iOS exposes continuous viewport precision.
Within one stable Readium position is the qualified quantized restore bound.

If restoration fails, validate the Locator against the same publication and
source generation. A Locator from another edition or modified EPUB is not a
portable coordinate.

## Footnotes navigate instead of opening the app UI

- Start with `footnotePolicy.mode = 'semantic'` and inspect the publisher's
  `epub:type`, role, rel, and target structure.
- Enable `semantic-and-heuristic` only when the catalog needs it.
- Keep heuristic rules closed and specific; broad class fragments create false
  positives.
- A synchronous `classifyFootnote` callback may downgrade a prevented candidate
  to ordinary navigation. Ensure it does not return `navigate` accidentally.
- Nested links inside rendered note content must go back through your link
  policy; do not inject untrusted HTML into a privileged WebView.

## Custom fonts do not appear

1. Confirm each `.ttf`/`.otf` source is inside the Expo project and has a valid
   font signature.
2. Declare every weight/style as a distinct face with one exact shared family.
3. Re-run clean prebuild; runtime reload cannot change the native font manifest.
4. Ensure `typographyProfile` uses the exact declared family or a generic
   family.
5. Inspect `getDiagnostics().fonts`: `valid` includes admitted face/family
   counts; `invalid` is fail-closed.
6. Check whether `publisherStyles: 'preserve'` intentionally retains the
   publisher family. Use `hybrid` or `override` according to product policy.

Do not work around font failures with raw CSS, scripts, data URLs, or a Readium
fork.

## RTL direction or controls look reversed

Publication reading progression, content text direction, and app chrome layout
are separate inputs. Use language/direction typography rules for content and
the SDK's logical forward/backward commands for navigation. If your product
uses physical controls, keep Previous on the left and Next on the right rather
than mirroring them with RTL text.

Test mixed bidi selections and footnotes as well as a fully RTL book. Do not
derive direction from a single selected DOM node; that detail is unavailable on
the current native baseline.

## Selection actions or geometry are missing

Custom actions appear only when configured before selection and are capped at
eight. System Copy remains governed by publication rights. Geometry is an
optional clipped aggregate rectangle, not one rectangle per rendered line.
Anchor app UI defensively when it is absent, and call `clearSelection()` after
your workflow completes.

## Decorations do not match the database

Treat storage as authoritative and one decoration group as a replaceable view
projection. Validate the entire add/update/remove delta, serialize durable
mutations, and retry a full `setDecorations` after a native drawing failure.
Never reuse the search result/current groups for bookmarks or annotations.

## Search stops early or rejects a cursor

Pages are capped at 100 results and a session at 2,000. Cursors are forward-only
and single-use, and one generation owns one active native search iterator. A
new search, source change, close, or unmount cancels the old session. Keep the
session ID with each cursor and surface `truncated` rather than silently
claiming completeness.

## Image zoom/share is unavailable

Honor the activation event's rights and `source.resolvable` fields. Android
fixed-layout image activation is unavailable with Readium Kotlin 3.1.2 and is
reported through capabilities. Resolved images are temporary,
generation-scoped local files; release every ID in `finally`. The SDK never
fetches external publication images.

## A native dependency upgrade fails

Readium pins are exact. Do not force versions, suppress Kotlin metadata errors,
or add another Readium graph. Follow the full procedure in
[limitations and upgrades](limitations-and-upgrades.md): regenerate a clean
consumer, run contracts and both native builds, replay lifecycle/RTL/fonts/
footnotes/selection/decorations/search/accessibility/performance, and then run
the catalog sweep.

## What to include in a bug report

- `native-epub-kit`, Expo, React Native, iOS/Android, Xcode/JDK/SDK versions.
- Stable error `code`, `phase`, and `recoverable` fields.
- The bounded diagnostic report and exact reproduction steps.
- A generated or clearly redistributable minimal EPUB when content matters.
- Whether the issue survives a clean prebuild and clean consumer.

Redact private content. Security issues follow the repository's private
security policy, not a public issue.
