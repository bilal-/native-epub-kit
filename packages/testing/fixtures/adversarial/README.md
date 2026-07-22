# Adversarial source fixtures

These tiny files exercise publication-source failures without redistributing
third-party content. They are authored for Native EPUB Kit and may be used
under the repository's MIT license.

- `corrupt.epub` has an EPUB extension but is deliberately not a ZIP archive.
- `unsupported.txt` is a readable local file with an unsupported format.
- `unreadable.epub` is copied into the example application's document
  directory and assigned mode `000` by the local qualification harness.

They are not EPUB conformance fixtures and must not be passed to EPUBCheck.
