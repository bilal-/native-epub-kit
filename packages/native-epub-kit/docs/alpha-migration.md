# 0.x alpha migration guide

Native EPUB Kit follows semantic versioning, but the public API is not frozen
during 0.x. Each candidate is content-addressed and native pins remain exact.
Read the package changelog and Changesets before replacing a working archive.

## Upgrade checklist

1. Record the current package version, archive integrity, Readium pins, Expo,
   React Native, iOS, and Android toolchains.
2. Read every change between the two 0.x candidates and classify source,
   persistence, native-config, and behavior changes.
3. Install the new exact package; do not copy source or maintain a private
   Readium patch.
4. Re-run `npx expo prebuild --clean` whenever the plugin, fonts, package,
   Expo, React Native, or native pins change.
5. Confirm one Native EPUB Kit module and one Readium graph per platform.
6. Typecheck and test the app, build iOS and Android, then replay the relevant
   device and catalog matrices.
7. Only then update the recorded package integrity and release evidence.

## Locator and persistence rules

The canonical durable position is the complete versioned Readium Locator JSON.
Never migrate it to EPUB CFI, chapter index, percentage, resource-only href, or
a private DOM selector. Preserve unknown Locator extension fields.

The SDK does not own a database schema. Consumers implement
`ReaderPersistenceAdapter` and version their own records. When a 0.x release
changes a persisted SDK record:

- validate old data before passing it to the new controller;
- migrate explicitly and transactionally when production users exist;
- keep current and furthest progress distinct;
- fail closed on malformed bookmarks, annotations, or preferences; and
- test restore against the exact same publication edition.

Prelaunch consumers with no production data may deliberately wipe their test
database instead of shipping migration code. Record that as a product decision,
not an implicit fallback.

## Common breaking-change categories

| Change                         | Required consumer action                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| View prop or ref command shape | Update TypeScript call sites and replay both native implementations.                           |
| Event identity/order           | Re-audit stale generation rejection and lifecycle state machines.                              |
| Locator/progress semantics     | Preserve complete Locators; replay exact restore and chapter/overall progress.                 |
| Capability or precision field  | Update UI to trust the new explicit status, never infer parity.                                |
| Persistence record validation  | Version/migrate the app schema or perform an intentional prelaunch reset.                      |
| Config-plugin/font schema      | Update `app.json`, clean prebuild, inspect native manifests/resources, rebuild both platforms. |
| Readium/Expo/React Native pin  | Run the complete upgrade matrix and clean consumer; a compile alone is insufficient.           |
| Error code/recoverability      | Update recovery mapping without parsing message text.                                          |

## Moving from an early direct Readium wrapper

Do not translate legacy CFI or wrapper-private progress into a new pseudo-
Locator. Prefer one of two explicit strategies:

1. For launched apps, retain the old reader temporarily, open the publication,
   ask it for a location that can be mapped through a documented standard, and
   validate the resulting Readium Locator before cutting over.
2. For prelaunch/test-only apps, destructively reset reader state and start with
   the generation-1 Native EPUB Kit schema.

Remove the old bridge, EPUB.js/WebView stack, native plugin overrides, helper
hooks, models, and CFI compatibility only after the new exact candidate passes
clean builds and the catalog sweep. Do not leave two Readium graphs active.

## Alpha-to-stable expectations

The stable release will document any final breaking delta and provide a clean
upgrade path from the latest supported 0.x line. A stable version does not
promise that every publisher EPUB is valid or that platform toolkits expose
identical precision; it promises explicit contracts, capability reporting,
tested compatibility, and semver-governed changes.

Until then, pin the exact package version or tarball integrity and upgrade one
candidate at a time. Never use a floating branch, Git URL, or unqualified native
override in a release application.
