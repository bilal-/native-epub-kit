# Known failing example flows

Recorded 2026-10-19 while verifying `8ce55a1` (scrolled-layout chapter swipes).
Each failure below reproduces identically with and without that change, so it
predates it. These flows need updating before the next release.

Environment: Xcode 27.1, iOS 26.5 simulators (iPhone 17 Pro and 17 Pro Max),
Android API 33 emulator (`reader_modernization_pixel_6_api33`), Debug example
builds against local Metro.

| Flow                                         | Platform | Failing assertion                                                     |
| -------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `navigation-boundary-swipe-chapter-disabled` | iOS      | `gesture boundary yes · part-1.xhtml · (0.667\|0.750)` after Boundary |
| `navigation-policy`                          | iOS      | `gesture moved yes · resource same no` after the paginated swipe      |
| `navigation-policy`                          | Android  | `gesture moved yes · resource same yes` after the paginated swipe     |
| `navigation-boundaries` (paginated section)  | Android  | `event end/forward/unit Part one→Part two` after the rollback swipe   |

All four exercise paginated layout, where the gesture-boundary preparation or
the expected movement no longer matches what the example reports on these
devices. Check the preparation positions and swipe coordinates against current
Readium pagination before changing production code.

`progress-gestures` also fails when run directly because it requires
`EXPECTED_PRECISION` and `EXPECTED_INITIAL_VIEWPORT`; pass them with `-e` as the
qualification scripts do.
