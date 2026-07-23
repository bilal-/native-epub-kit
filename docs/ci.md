# Continuous integration and release safety

## Required checks

The CI workflow runs with read-only repository permissions:

- JavaScript/TypeScript lint, formatting, typecheck, tests, and builds.
- Workflow policy validation and Changeset enforcement.
- A clean package pack with build-intermediate rejection.
- Android CNG, module lint/unit-test task, and app debug assembly.
- iOS CNG, CocoaPods resolution, and simulator build.

The dependency-review workflow rejects newly introduced moderate-or-higher
known vulnerabilities and selected network/copyleft licenses on pull requests.
Dependabot checks pnpm and pinned GitHub Actions dependencies weekly.

All third-party actions are pinned to immutable commit SHAs. The adjacent
version comments are informational and must be updated with the SHA.

## Local equivalents

```bash
pnpm install --frozen-lockfile
pnpm ci:workflows
pnpm licenses:check
pnpm native-pins:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm example:prebuild
```

Native build commands are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Secrets

No current CI or dry-run release job requires a repository secret. Workflows
must not print environment values, signing material, publication tokens, EPUB
sources, or consumer data.

Public GitHub secret scanning is complemented by the checked-in Gitleaks
configuration. Maintainers with Gitleaks installed can run
`gitleaks dir . --redact`; generated native/dependency output is excluded,
while authored source, configuration, and documentation remain in scope.

Future npm provenance, signing, device farms, private corpus runs, and store
uploads are optional external gates. Each requires separate documentation,
least-privilege secrets, and explicit maintainer authorization before it is
enabled.

## Dry-run release workflow

The manually dispatched release workflow builds and tests the workspaces, packs
the package, installs it into a clean temporary consumer, and uploads the
tarball as a workflow artifact. It has read-only permissions and contains no
publish, tag, release, or push command.

Publishing to npm and creating GitHub releases remain manual external gates.
