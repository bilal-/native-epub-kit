---
'native-epub-kit': patch
---

Apply scrollable-range chapter progress to position-precision location events.
Android reports position precision, so its chapter progress still stopped a
screen short (67% at the bottom of a final chapter) while publication progress
reached 100%.

On Android, map both viewport edges through the resource interval, because
Readium's top total progression is position-quantized (a fully scrolled final
chapter read 91%), and re-measure the viewport's share of the resource after
each event so a measurement taken while the page is still laying out does not
stick.
