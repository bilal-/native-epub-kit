---
'native-epub-kit': patch
---

Keep Expo SDK 56 iOS projects building with Xcode 27.1. The config plugin now
raises pod deployment targets below the app minimum (Readium resource bundles
and CryptoSwift declare iOS 11/13) and converts the ExpoModulesJSI setter
callback that Xcode 27.1 rejects. The JSI patch skips itself once Expo ships the
fix and fails prebuild if the surrounding source changes.
