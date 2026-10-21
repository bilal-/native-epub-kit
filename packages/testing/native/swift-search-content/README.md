# iOS search content qualification

This harness searches generated XHTML through Readium's real `StringSearchService` and the production extractor. It checks paragraph and inline boundaries, entities, malformed Urdu, no matches, read failures, and resource/highlight locators. No publication files are required.

Build the example for an iOS simulator first, then select an already booted simulator explicitly:

```sh
node packages/testing/scripts/test-swift-search-content.mjs \
  --device <simulator-UDID> \
  --products-directory <DerivedData>/Build/Products/Debug-iphonesimulator \
  --pods-directory apps/example/ios/Pods
```

Run from the repository root on macOS with Xcode. The products must match the host architecture. The harness compiles against the installed, pinned Pod modules, runs only on the selected simulator, and removes its temporary executable. Add `--default-extractor` to reproduce the paragraph-boundary failure in Readium's default extractor.
