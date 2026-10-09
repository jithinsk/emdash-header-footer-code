# Changelog

All notable changes to `emdash-header-footer-code`. The package follows [semver](https://semver.org/); adding a capability is always a major version. Full documentation: <https://emdash-code.jithins.dev/changelog/>.

## 0.1.2 (2026-10-09)

- **Docs:** the npm homepage now points at the documentation site, <https://emdash-code.jithins.dev>, and the README links to it.
- No runtime or admin changes from 0.1.1.

## 0.1.1 (2026-10-05)

- **Release:** published through npm trusted publishing (OIDC), with no long-lived npm token. Every release now carries an npm provenance attestation linking the tarball to the commit and workflow that built it.
- No runtime or admin changes from 0.1.0.

## 0.1.0 (2026-10-05)

First public release, built from commit `0ffa692`.

- `page:fragments` hook that outputs snippets in the head, body start or body end of public pages.
- Targeting by include/exclude path patterns, page kind and locale; exclude wins over include. Patterns match decoded paths, so non-ASCII patterns such as `/blog/café/*` work as typed.
- Ordering by priority, then creation time, then id.
- Admin page: snippet list with search and placement filter, code editor with line numbers, Code/Targeting tabs with a sticky Settings card, duplicate, delete and per-row on/off.
- Kill switch that turns off all output without touching snippets.
- Change log of every create, update, enable, disable, duplicate, delete and kill-switch change.
- Role-aware API: Admins (`plugins:manage`) write; Editors (`plugins:read`) get a list without code.
- Limits: 64 KB per snippet, 512 KB total, 100 snippets.
- Per-isolate cache with a revision check at most once a second; the revision is bumped before the change-log write.
- Synchronous transform pipeline for extension packages.
