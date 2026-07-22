# Naming and Attribution Decision

Decision date: 2026-07-11

## Selected identifiers

| Surface                    | Identifier                     |
| -------------------------- | ------------------------------ |
| GitHub repository          | `bilal-/native-epub-kit`       |
| npm package                | `native-epub-kit`              |
| Future optional UI package | `native-epub-ui`               |
| Native module/class prefix | `NativeEpubKit` / `NativeEpub` |
| React view                 | `EpubReaderView`               |
| Headless hook              | `useEpubReader`                |

GitHub and npm checks found the selected repository and package names available
at decision time. Availability is not a reservation of the npm name; publishing
remains a separately authorized release gate.

## Rationale

Expo's official brand guidelines say third-party products and services should
not use Expo marks in their names or imply endorsement. The prior working name
`expo-readium` was therefore rejected before public API or native identifiers
were created.

The neutral name also avoids treating Readium as project branding. Documentation
may accurately state that the SDK is compatible with Expo/React Native and
depends on the official Readium toolkits. Every public surface must retain the
independent-project disclaimer and avoid Expo or Readium logos.

Sources:

- <https://expo.dev/brand>
- <https://docs.expo.dev/modules/third-party-library/>
- <https://github.com/readium/swift-toolkit>
- <https://github.com/readium/kotlin-toolkit>
