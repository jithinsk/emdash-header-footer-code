# v0.1 launch checklist

- [ ] CI green on main
- [ ] `pnpm smoke` passes (packed tarball → `astro build` → production server)
- [ ] Manual check on a fresh `npm create emdash@latest` (1.0.1+) starter, installing **from the packed tarball**, not a link or workspace path: run `pnpm build && npm pack` here, then in the starter `npm install /abs/path/to/emdash-header-footer-code-0.1.0.tgz`; add `headerFooterCode()` to astro.config.mjs; create a head snippet in the admin; see it on `/` (both `astro dev` and `astro build` + `node dist/server/entry.mjs`), not on `/_emdash/admin`
- [x] v0.1.0 published manually from the maintainer's machine (no provenance)
- [x] npm trusted publisher configured (jithinsk/emdash-header-footer-code, release.yml); token publishing disallowed
- [ ] Tag `v0.1.1`; confirm the release workflow publishes and the npm page shows provenance
- [ ] PR to awesome-emdash
- [ ] Post in EmDash GitHub Discussions → "Show and tell"
- [ ] Short build-log post
