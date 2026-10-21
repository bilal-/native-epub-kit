# Production footnotes and hyperlink policy

LIB-050 promotes footnotes and hyperlink activation from qualification hooks to
the stable `EpubReaderView` API. The implementation uses the official Readium
Swift and Kotlin navigator callbacks; it does not fork Readium, install a DOM
click listener, accept executable consumer code, or open another application.

## Public surface

```tsx
<EpubReaderView
  source={source}
  footnotePolicy={{ mode: 'semantic-and-heuristic' }}
  linkPolicy={{
    allowedExternalSchemes: ['https'],
    externalLinks: 'intercept',
    unsupportedSchemes: 'block',
  }}
  classifyFootnote={(event) =>
    event.id === 'publisher-navigation-target' ? 'navigate' : 'footnote'
  }
  onFootnotePress={showConsumerOwnedSheet}
  onLinkPress={handleLinkActivation}
/>
```

The default footnote mode is `semantic`; the default link policy allows HTTP
and HTTPS, intercepts those links, and blocks every unsupported scheme. Policy
objects use closed fields and values, reject unknown or invalid input
atomically, and are normalized before being sent to native code.

`FootnoteEvent` contains semantic or heuristic classification, canonical source
and optional target locators, href, bounded plain text, optional bounded HTML,
optional id/language/direction/content type/referrer/geometry, a truncation
flag, and the native ownership identity. `ReaderLinkEvent` contains the same
identity and locator boundary plus a closed `kind` of `internal`, `external`,
or `unsupported` and a closed disposition of `followed`, `intercepted`, or
`blocked`.

Both records are validated at the JavaScript boundary. `ReaderLinkEvent` is
also one of the versioned `core-v1` records round-tripped by TypeScript, Swift,
and Kotlin. Optional geometry uses the shared `reader-view-and-window-v1`
logical-point/dp contract when a native activation hook supplies it. The
current Readium hyperlink hooks do not expose activation rectangles, so native
footnote and link events omit geometry rather than manufacturing coordinates.

## Synchronous native decision

Classification happens before default navigation:

| Activation                 | iOS Readium hook         | Android Readium hook                                 | Result                                                                           |
| -------------------------- | ------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Semantic note              | `shouldNavigateToNoteAt` | `shouldFollowInternalLink` with `FootnoteContext`    | Prevent synchronously, resolve bounded content, emit a semantic note             |
| Non-semantic internal link | `shouldNavigateToLink`   | `shouldFollowInternalLink` without `FootnoteContext` | Evaluate declarative rules/heuristic; otherwise follow and emit an internal link |
| External URL               | `presentExternalURL`     | `onExternalLinkActivated`                            | Classify scheme, emit intercepted/blocked event, never system-open               |

Returning `false` for a note candidate is synchronous on both platforms. The
source locator is captured first, so asynchronous target lookup or content
extraction cannot race Readium navigation. Every result is gated by view
instance, source generation, navigator identity, and publication identity;
replacement and unmount cancel pending extraction.

The optional JavaScript `classifyFootnote` callback runs only after native code
has safely prevented a semantic or heuristic candidate. It can keep the event
as a footnote or downgrade it to navigation. A downgrade uses the resolved
target locator when available, records normal jump history, and emits a
`followed` internal `ReaderLinkEvent`. If the callback throws or navigation
fails, the wrapper fails safe by delivering the footnote. JavaScript is never
asked to synchronously cancel a native WebView navigation.

Consumers that need to promote known malformed publisher links configure
native-safe `heuristicRules`. These are data-only matchers with a required
unique ID and one or more fragment-prefix, fragment-suffix, or resource-suffix
fields. There are at most 16 rules, every value is NFC-normalized and bounded
to 128 UTF-16 units, and regular expressions or scripts are not accepted.

## Classification order

The native decision is deterministic:

1. `navigate` mode follows every internal link, including semantic notes.
2. In other modes, Readium semantic evidence emits a semantic note.
3. In `semantic-and-heuristic`, the first declarative consumer rule can emit a
   heuristic note.
4. The built-in conservative fallback requires both a notes-like resource
   filename and a note-like fragment.
5. Everything else follows as an ordinary internal link.

A same-document fragment alone is never treated as a note. The conservative
fallback deliberately prefers false negatives; publishers with stable legacy
patterns should use a declarative rule.

## Content and trust boundary

HTML is capped at 65,536 UTF-16 units and plain text at 32,768. Bounds end at a
user-perceived character boundary and set `truncated` when either
representation is shortened. Heuristic targets may require native resource
lookup; only target resources no larger than 1 MiB are inspected, and only the
element matching the requested fragment is extracted. The fixture proves
multi-paragraph Urdu/English content, `lang="ur"`, `dir="rtl"`, and formatted
HTML parity across both adapters.

Bridged HTML is untrusted EPUB input, not render-safe markup. The core package
does not render it. A consumer-owned sheet must sanitize an allowlist, enforce
nested-link and URL policy, provide a plain-text fallback, manage focus, and
apply product typography. Those app concerns belong to APPUI-051.

Native diagnostics and errors never include note text, HTML, source headers,
or external-link contents beyond the stable event delivered to the configured
consumer callback.

## External and unsupported schemes

`allowedExternalSchemes` contains at most 16 normalized URI schemes. A matching
scheme is classified as `external`; every other scheme, including `mailto` by
default, is `unsupported`. Each group can be intercepted or blocked.

Both dispositions remain observable through `onLinkPress`, and neither opens a
browser or another app from native code. An application that wants to open an
intercepted URL can confirm it, apply its own allowlist, and call the platform
linking API itself. This keeps malformed or hostile EPUB links from crossing an
application boundary without explicit host policy.

Readium Kotlin 3.1.2's public external callback receives HTTP-shaped absolute
URLs, but its package-internal URL parser lets user-activated custom schemes
such as `mailto:` fall through to WebView. The Android adapter installs a
generation-scoped compatibility wrapper around Readium's existing WebView
listener. It intercepts only main-frame non-HTTP(S) requests,
delegates every other listener method unchanged, and feeds the URI into the
same closed link policy. It does not replace Readium's WebView client or inject
script. Reflection is confined to this exactly pinned upstream seam, protected
from minification by consumer rules, unit tested as a pure predicate, and
covered by the installed blocked-`mailto` journey.

## Event and location invariants

- A prevented note event is emitted before any navigation can occur.
- Opening or dismissing a footnote produces no location movement.
- Target resolution does not replace the captured source locator.
- Ordinary internal navigation emits a followed link event and normal stable
  location/history updates.
- Consumer downgrade follows the same navigation/history path.
- Stale asynchronous results are suppressed after close, replacement, or
  unmount.
- No delayed stability probe is part of the public API; installed tests compare
  stable locations through normal commands after 350 ms.

## Contract and device matrix

`footnote-link-policy-v1/cases.json` is a shared 15-case contract executed by
TypeScript, Swift, and Kotlin. It covers all modes, semantic precedence,
conservative matching, declarative rules, same-document false positives,
defaults, HTTP/HTTPS, custom schemes, missing schemes, and intercepted/blocked
dispositions.

The deterministic `footnotes.epub` fixture covers:

1. same-resource semantic content;
2. cross-resource semantic content in a non-linear notes resource;
3. a normal cross-resource internal link;
4. a malformed multi-paragraph RTL heuristic note;
5. a semantic candidate downgraded by the consumer classifier;
6. an intercepted HTTPS URL; and
7. a blocked `mailto` URL.

Installed iOS and Android journeys run in the example's full-reader mode and
assert note content, locators, classification, language/direction, bounded
HTML, non-truncation, 350 ms location stability, consumer navigation, ordinary
navigation, scheme policy, and that no external app is launched. The final
LIB-050 evidence and exact commands are recorded in the app program's
`docs/reader-modernization/evidence` directory.

## Whole-resource footnotes

A consumer heuristic rule may identify a footnote stored in its own HTML resource without a fragment identifier. Native extraction reads the bounded resource and returns only the document body; head metadata is excluded. Links without a matching semantic or consumer heuristic classification continue to navigate normally.
