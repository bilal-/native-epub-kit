---
'native-epub-kit': minor
---

Expose `NavigationUnitContext.atLastPosition` so continuation interfaces can
offer an explicit end action at the final known position without treating a
coarse progress percentage as completed reading. Keep iOS current-location and
navigation-unit context records on the resolved destination after animated
resource jumps instead of regressing to a stale source locator.
