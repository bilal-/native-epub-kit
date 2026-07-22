# Readium Swift commit podspecs

These four integration podspecs describe the unmodified Readium Swift source at
the exact signed upstream commit
`e43a052ded9fab70d7f0e8f6f19bd7e9edeac94f`. That commit is eight commits after
the 3.10.0 tag and includes upstream PR 845, which restores custom font loading
for the `WKURLSchemeHandler` asset origin.

The metadata is derived from the BSD-3-Clause podspecs in
`Support/CocoaPods/` at that same commit. Only the package version, dependency
constraints, and source selector differ: the source selector uses the exact
commit rather than the older 3.10.0 tag. No Readium Swift source is copied or
patched in this repository.

The Expo config plugin adds these local specifications to the generated app
Podfile. Upgrade all four atomically and regenerate the native dependency lock
evidence; mixing Readium module revisions is unsupported.
