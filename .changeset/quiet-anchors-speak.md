---
'native-epub-kit': patch
---

Resolve footnote content for notes whose link target is an empty anchor, such
as `<a id="note"></a><p>…</p>` from page-layout EPUB exports. When the element
carrying the id has no text, the footnote event's HTML is now the block (or
rest of the paragraph) that immediately follows it. Self-closing anchors no
longer capture unrelated content up to a later `</a>`. Extraction moved into
the iOS and Android `FootnoteLinkPolicy` and is pinned by shared
`contentCases` in the footnote/link contract.
