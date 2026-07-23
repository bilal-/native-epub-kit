---
'native-epub-kit': patch
---

Accept Android fragment navigation when the requested target element is already
inside the visible viewport, while retaining resource and target checks. This
prevents valid same-resource footnote jumps from timing out when Readium does
not scroll an already-visible anchor.
