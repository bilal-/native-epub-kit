---
'native-epub-kit': patch
---

Report chapter and publication progress across the scrollable range. Locators
mark the top of the viewport, so progress stopped a screen short of 100% at the
end of a chapter (a short final chapter read 26% when fully scrolled). iOS and
Android now include the bottom of the viewport in stable location events as
`visibleRange`, and derived progress is 0 at the very top, 1 when the bottom of
the viewport reaches the end, and linear in between. Locators, and therefore
saved reading positions, are unchanged.
