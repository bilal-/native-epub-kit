# Native EPUB Kit contributor instructions

This repository is an unofficial Expo Modules wrapper around the official
Readium mobile toolkits. Preserve the independent-project disclaimer and do not
use Expo or Readium names or logos as project branding.

## Scope and architecture

- Keep native-epub-kit headless. Product-specific UI and persistence belong in
  consuming applications.
- Keep Swift, Kotlin, and TypeScript contracts symmetric.
- Treat Readium locators as canonical reading positions.
- Do not fork or copy Readium source into this repository.
- Do not add copyrighted Alislam EPUBs, proprietary fonts, secrets, or user
  data. Public fixtures must be generated or clearly licensed.
- The example uses Expo Continuous Native Generation. Edit app configuration,
  then regenerate native projects; do not hand-edit generated app native files.

## Required checks

Run these from the repository root:

1. pnpm install --frozen-lockfile
2. pnpm lint
3. pnpm typecheck
4. pnpm test
5. pnpm build

For native changes, also prebuild and build the example on every affected
platform. Do not treat a TypeScript-only test as native verification.

## Release safety

Never push, publish a package, create a release, or upload an app unless the
user explicitly authorizes that exact external action. Changesets document
release intent; they do not authorize publication.
