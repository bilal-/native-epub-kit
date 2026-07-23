# Fixture provenance and licenses

## Generated fixture content

All English, Arabic, and Urdu fixture prose, markup, build code, and the SVG
illustration were authored specifically for Native EPUB Kit in July 2026. They
are distributed under the repository's MIT License. The prose is synthetic
test content, not an excerpt or adaptation of an Alislam publication.

The generated books have deterministic identifiers under the reserved fixture
namespace and must not be presented as real publications.

## Noto Sans Arabic

`rtl-custom-font.epub` embeds the unmodified variable Noto Sans Arabic font:

- Upstream: Google Fonts `ofl/notosansarabic`
- Upstream commit: `ec0464b978de222073645d6d3366f3fdf03376d8`
- File: `NotoSansArabic[wdth,wght].ttf`
- SHA-256: `63111b5b2e074dd48cc67692e0a2726d86ee94c1c37fe8598257b7b4e87e869e`
- Copyright: Copyright 2022 The Noto Project Authors
- License: SIL Open Font License 1.1 (`OFL-1.1`)

The exact upstream URL and checksum are recorded in `assets.json`. The build
downloads the file from an immutable Git commit, verifies its SHA-256, and
embeds both the font and a human-readable copy of its OFL license in the EPUB.
The standalone license is in `licenses/NotoSansArabic-OFL.txt`.

## EPUBCheck

Fixture conformance is checked with the official W3C EPUBCheck 5.3.0 release.
The release archive URL and SHA-256 are pinned in `../tools/epubcheck.json`.
EPUBCheck is BSD-3-Clause licensed and is downloaded to the ignored local
cache; its source or distribution is not copied into this repository.

## Updating external assets

An asset update requires all of the following in the same change:

1. Pin an immutable upstream commit or release.
2. Verify the copyright and SPDX license identifier.
3. Update the URL and SHA-256 in the relevant manifest.
4. Preserve the required license text.
5. Rebuild and run `pnpm fixtures:verify`.
6. Review the generated EPUB and manifest diff.
