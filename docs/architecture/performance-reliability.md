# Core performance and reliability

Status: app-ready 0.x core qualified by LIB-091.

## Outcome

Native EPUB Kit passes the launch-critical open, reopen, restoration, event-rate,
memory, and representative scrolling budgets approved at GATE-Q. The same
instrumented journey also exercises publication-data bridging, direct source
replacement, preferences, all three typography modes, 500 representative
decorations, 2,000 extreme-stress decorations, and a bounded 2,000-result
search.

The report is a deterministic qualification guard, not a promise that every
EPUB or device has identical timings. Product consumers should repeat it when
changing Readium, Expo, React Native, WebView/WebKit, native fonts, or the
supported-device floor.

## Harness

`apps/example/PerformanceSmokeApp.tsx` runs the native reader rather than a
mock. It writes `native-epub-kit-performance.json` to the app Documents
directory and does the following in one generation-safe sequence:

1. opens a normal generated EPUB from a local file;
2. performs 20 destructive close/reopen cycles and captures native ownership
   and memory diagnostics;
3. samples publication-data commands and ten direct source replacements;
4. alternates native preferences and preserve/hybrid/override typography;
5. applies and clears 500 decorations, then repeats at the Tier B 2,000-item
   stress ceiling and navigates to the first and final exact anchors;
6. consumes all 20 pages of a deliberately truncated 2,000-result search;
7. closes and restores exact position 175; and
8. opens the representative long `minimal-en.epub`, records real gestures, and
   verifies no more than ten foreground progress events per second.

The smoke build is selected only when
`EXPO_PUBLIC_PERFORMANCE_SMOKE=1`. The normal example remains unchanged.
`performance-core.yaml`, `performance-scroll.yaml`, and
`performance-scroll-replay.yaml` keep core execution separate from real input,
so a slow UI-test driver is never treated as a millisecond benchmark.

## Qualified environments

| Platform | Reference target                                 | Native renderer                                                   | Readium pin                                                                     |
| -------- | ------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| iOS      | iPad mini (A17 Pro) simulator, iPadOS 26.5       | WKWebView / Core Animation                                        | Swift `3.10.0-fontfix.845`, revision `e43a052ded9fab70d7f0e8f6f19bd7e9edeac94f` |
| Android  | Dedicated Pixel 6 phone AVD, Android 13 / API 33 | Hardware-accelerated gfxstream/Metal on Apple M5 Pro, Skia OpenGL | Kotlin `3.1.2`, revision `71074ea0c424eabbc39a93b48a4cefe366f7741b`             |

The separate 252-publication application sweep supplies a broader normal-book
cold-open distribution: iOS P95 is 37 ms and Android P95 is 1,198 ms. Both are
below the retained 3-second budget. The numbers below come from the isolated
core harness and are intentionally reported separately.

## Results

| Metric                             | Budget or interpretation                                                      |                                                       iOS |                                                 Android | Result |
| ---------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------: | ------------------------------------------------------: | ------ |
| Normal fixture cold open           | `< 3,000 ms`                                                                  |                                                    108 ms |                                                  223 ms | PASS   |
| Warm reopen, 20-cycle P95          | `< 1,500 ms`                                                                  |                                                    166 ms |                                                  190 ms | PASS   |
| Close, 20-cycle P95                | Diagnostic                                                                    |                                                     22 ms |                                                   30 ms | PASS   |
| Publication-data bridge, P95       | Diagnostic                                                                    |                                                      7 ms |                                                    5 ms | PASS   |
| Direct source replacement, P95     | Diagnostic                                                                    |                                                    168 ms |                                                  302 ms | PASS   |
| Native preference application, P95 | Diagnostic                                                                    |                                                      9 ms |                                                   19 ms | PASS   |
| Typography application             | Fonts load and locator remains stable                                         |        697–716 ms steady state; one 2,304 ms cold profile |                                              319 ms P95 | PASS   |
| Representative decorations         | 500 remain responsive                                                         |                                 53 ms apply / 24 ms clear |                               97 ms apply / <1 ms clear | PASS   |
| Extreme decorations                | 2,000 usable, Tier B                                                          | 196 ms apply / 2,961 ms exact two-jump probe / 1 ms clear | 255 ms apply / 728 ms exact two-jump probe / 3 ms clear | PASS   |
| Bounded native search              | 2,000 exact results, 20 pages, explicit truncation                            |                                                    680 ms |                                                  851 ms | PASS   |
| Exact restore                      | Within one stable Readium position                                            |                                   175 → 175, 15 ms reopen |                                175 → 175, 433 ms reopen | PASS   |
| Progress-event rate                | `<= 10/s` during real scrolling                                               |                                               1/s maximum |                                             1/s maximum | PASS   |
| Twenty-cycle resources             | Zero live sessions/assets/publications/leases and no forced-release violation |                                                  all zero |                                                all zero | PASS   |
| Post-warm-up memory trend          | Bounded, not necessarily returned to initial RSS                              |                   +34,832,384 B; +2,750,640 B/cycle slope |                   −32,820,224 B; +176,914 B/cycle slope | PASS   |

Memory is judged by bounded post-warm-up behavior and exact native ownership,
not by demanding that WebKit, the allocator, or Readium discard every cache.
Each final run ended with zero active sessions, assets, publications, source
leases, and forced-release violations.

## Representative scroll evidence

The Android frame sample was reset immediately before twelve alternating real
gestures on the long LTR fixture. It recorded 668 frames, 12 janky frames
(1.80%), 18 ms P50, 21 ms P95, 23 ms P99, and 18 ms GPU P95. No slow UI-thread,
missed-vsync, bitmap-upload, or long-tail frame bucket was recorded. The
renderer identity is retained next to the report so a software-rendered sample
cannot be mistaken for product evidence.

An earlier Android tablet sample reported 100% jank. Investigation proved that
the AVD had `hw.gpu.enabled=no` and rendered through SwiftShader. That sample is
retained as infrastructure diagnostics and rejected from the gate. Repeating
the same test on the dedicated hardware-accelerated AVD produced the numbers
above.

Apple's `Animation Hitches` and `Core Animation FPS` Instruments explicitly
reject simulator targets. The equivalent supported evidence is therefore the
successful iPad real-gesture event-rate report, targeted screenshots, and a
36-second H.264 simulator recording at 1488×2266 for manual cadence review.
This is recorded as a tooling limitation, not silently converted into a frame
claim. A future physical-device release profiling pass should use Animation
Hitches without changing the current app-ready simulator gate.

## Reliability defect closed during profiling

The 2,000-decoration journey exposed an Android exact-anchor settlement defect
that smaller books did not reveal. Readium Kotlin can report a coarse numeric
position while its visible WebView locator carries the exact destination as a
CSS selector. The previous policy could either settle merely because the XHTML
resource matched or discard a correct visible-selector result when a timeout
expired while the non-cancellable WebView callback was returning.

The Android adapter now:

- compares fragment targets with both canonical fragments and Readium's
  `locations.cssSelector`;
- accepts resource progression when numeric position granularity differs;
- performs one generation-scoped, non-animated retry after the initial bounded
  settlement window; and
- evaluates a returned exact visible locator before applying the manual
  deadline.

Focused Kotlin tests cover exact CSS/fragments, wrong-resource and wrong-anchor
rejection, coarse-position progression, strict compatible positions, and
missing-progression cases. Exact position 175 now survives close/reopen on both
platforms, and the 2,000-item first/final anchor probe completes without a
false timeout.

## Evidence

- `artifacts/LIB-091/device/ios-ipad-pass/report.json` — clean iPad core report.
- `artifacts/LIB-091/device/ios-ipad-representative-scroll/report.json` and
  `scroll-targeted.mp4` — representative iPad input/cadence evidence.
- `artifacts/LIB-091/device/android-phone-host-gpu-pass/report.json`,
  `gfxinfo.txt`, and `renderer.txt` — final accelerated Android report and
  frame evidence.
- `artifacts/LIB-091/device/android-tablet-pass-v2/report.json` — independent
  API-36 tablet functional/memory pass.
- `artifacts/LIB-091/diagnostic/` — rejected infrastructure samples and exact
  Android settlement investigation.

No unresolved core P0 or P1 reliability defect remains at LIB-091.
