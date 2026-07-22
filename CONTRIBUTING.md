# Contributing

Native EPUB Kit is a pre-1.0 community release candidate. APIs may change under
semantic versioning while the project proves Readium behavior on both native
platforms. Focus contributions on small, cross-platform capabilities with
reproducible evidence.

## Before opening a change

- Use GitHub Issues for a reproducible bug or a focused feature proposal.
- Use the private security path in [SECURITY.md](SECURITY.md) for
  vulnerabilities.
- Do not include restricted EPUBs, proprietary fonts, credentials, personal
  data, or copied Readium source.
- Keep product-specific UI, persistence, catalogs, and branding outside the
  headless core.

## Local setup

Required baseline:

- Node.js 22.13 or newer.
- pnpm 11.15.1 through the repository's package-manager pin.
- Xcode 26.4+ and CocoaPods 1.16+ for iOS work.
- JDK 21 and Android SDK 36 for Android work.

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:check
pnpm fixtures:verify
```

The example app uses Expo Continuous Native Generation:

```bash
pnpm example:prebuild
pnpm example:ios
pnpm example:android
```

Do not commit generated apps/example/ios or apps/example/android directories.

## Change expectations

- Keep Swift, Kotlin, and TypeScript contracts symmetric.
- Treat serialized Readium locators as canonical positions.
- Add tests at the lowest useful layer and native runtime evidence for native
  behavior.
- Preserve strict TypeScript and zero-warning linting.
- Update documentation in the same change as public behavior.
- Add a Changeset for publishable changes under the native package with
  pnpm changeset.

Choose patch for compatible fixes, minor for compatible features during 0.x,
and major only for an intentional stable-contract break.

## Pull requests

Keep a pull request focused. Explain the user-visible outcome, risks, test
matrix, and any known platform asymmetry. Screenshots are useful for visual
behavior, but they do not replace assertions or device logs.

By contributing, you agree that your contribution is licensed under this
repository's MIT License and that you have the right to submit it.
