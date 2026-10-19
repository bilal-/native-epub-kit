---
'native-epub-kit': minor
---

Add an opt-in `untitledResources` reader prop and derivation option. The default,
`separate-units`, keeps today's behaviour: every reading-order resource missing
from the table of contents becomes its own navigation unit. `merge-into-preceding`
folds those after the first resolved TOC entry into the preceding unit, so
publications that keep footnote or continuation pages in the reading order no
longer produce near-empty chapters in contents, chapter continuation, or chapter
swipe boundaries.
