---
'native-epub-kit': patch
---

Apply scrollable-range chapter progress to position-precision location events.
Android reports position precision, so its chapter progress still stopped a
screen short (67% at the bottom of a final chapter) while publication progress
reached 100%.
