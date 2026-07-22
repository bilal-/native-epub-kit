# Security policy

## Supported versions

There is no published production release yet. Before publication, security
fixes target the current release-candidate branch. After releases begin, the
latest 0.x minor line will receive security fixes unless a release notice says
otherwise; stable support policy will be declared with 1.0.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

If GitHub shows a **Report a vulnerability** button in this repository's
Security tab, use it to submit a private report. Otherwise, contact the
repository owner at <https://github.com/bilal-> without exploit details and ask
for a private reporting channel.

Include:

- Affected version or commit.
- Platform, OS, Expo, React Native, and native dependency versions.
- Reproduction steps or a minimal proof of concept.
- Likely impact and any known mitigation.
- Whether disclosure is subject to a deadline.

The maintainer will acknowledge a usable report when practical, coordinate a
fix and disclosure window, and credit reporters who want attribution. Do not
test against systems, publications, or user data you do not own or have
permission to use.

## Sensitive data

The SDK must not log EPUB contents, selected text, locators, source URLs, file
paths, or consumer identifiers by default. Reports and fixtures must be
redacted and use generated or clearly licensed content.
