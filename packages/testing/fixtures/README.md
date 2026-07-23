# Public EPUB fixtures

This directory contains reproducible, redistribution-safe EPUBs used by the
JavaScript, Swift, Kotlin, and end-to-end test suites. No Alislam publication
content is used here.

## Build and verify

From the repository root:

```sh
pnpm fixtures:build
pnpm fixtures:verify
```

`fixtures:build` downloads checksum-pinned source assets into the ignored
`packages/testing/.cache` directory, then writes the EPUBs and hash manifest to
`generated/`. Each ZIP entry has a fixed timestamp and stable ordering;
`mimetype` is first and uncompressed.

`fixtures:verify` performs two clean builds and compares every byte with both
the other clean build and the checked-in output. It then validates each book
with the checksum-pinned official EPUBCheck release. The malformed-link book
is an intentional negative fixture and must produce `RSC-007`; the search-
failure book is intentionally missing a reading-order resource and must
produce `RSC-001`; every other book must have no EPUBCheck errors or fatal
messages.

## Matrix

| Fixture                  | Primary coverage                                                                                   | Expected EPUBCheck result |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------- |
| `minimal-en.epub`        | Long LTR scroll, progress, gesture boundary, multiple spine items                                  | Valid                     |
| `toc-complex.epub`       | Nested, same-resource, and cross-resource fragment TOC entries                                     | Valid                     |
| `footnotes.epub`         | Semantic/cross-resource notes, RTL heuristic content, consumer/internal/external/unsupported links | Valid                     |
| `rtl-custom-font.epub`   | Long Urdu/Arabic scroll, RTL spine, progress, embedded OFL font                                    | Valid                     |
| `mixed-bidi.epub`        | Inline LTR/RTL switches, `bdi`, and `bdo`                                                          | Valid                     |
| `images.epub`            | Generated SVG, alt text, caption, zoom/share target                                                | Valid                     |
| `malformed-link.epub`    | Missing resource/fragment error handling                                                           | Invalid with `RSC-007`    |
| `annotation-stress.epub` | 2,048 targets plus a multi-page native position list                                               | Valid                     |
| `fixed-layout.epub`      | Two pre-paginated spine items and capability gating                                                | Valid                     |
| `search-failure.epub`    | Search completeness failure when a later reading-order resource is missing                         | Invalid with `RSC-001`    |

`fixture-specs.json` is the machine-readable source for coverage and expected
validation. `generated/manifest.json` adds deterministic size and SHA-256 data.
See [PROVENANCE.md](./PROVENANCE.md) for content and font licensing.
