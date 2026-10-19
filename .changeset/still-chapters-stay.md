---
'native-epub-kit': patch
---

Keep the page still when a disabled chapter swipe is attempted in scrolled
layout. iOS and Android previously let Readium turn to the adjacent resource and
then rolled it back, so readers saw the next chapter slide in and snap back
(Android also flashed a blank page). With `chapterTurnGesture: 'disabled'`,
Readium's `disablePageTurnsWhileScrolling` now stops the turn, and a horizontal
swipe that clears a shared distance and dominance threshold still emits
`onNavigationUnitBoundary`. Paginated layout keeps the existing rollback guard.
