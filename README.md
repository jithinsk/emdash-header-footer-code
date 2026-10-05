# emdash-header-footer-code

Add custom code snippets (analytics, verification tags, chat widgets, CSS/JS) to the head or body of your EmDash pages, with no theme edits.

![native plugin — runs as first-party code](https://img.shields.io/badge/native%20plugin-runs%20as%20first--party%20code-orange)

## Security notice

This plugin runs as first-party code with no permission sandbox. Snippet code is intentionally unsanitised HTML and is output exactly as written. Only users with the `plugins:manage` permission (Admins) can create, edit, enable or delete snippets. Never paste code you don't trust.

## Install

```sh
npm install emdash-header-footer-code
```

```js
// astro.config.mjs
import { headerFooterCode } from "emdash-header-footer-code";
export default defineConfig({
  integrations: [emdash({ /* … */ plugins: [headerFooterCode()] })],
});
```

Then redeploy. Native plugins cannot be installed from the EmDash plugin registry.

Requires `emdash` ^1.0.1. Manage snippets at `/_emdash/admin/plugins/header-footer-code/snippets` ("Header & Footer Code" in the admin sidebar).

## Capability

The plugin declares `hooks.page-fragments:register`. This is the only way to add scripts or HTML to public pages. Without it, EmDash would not register the hook. No other capability is requested.

## Theme requirements

Your layout must render `<EmDashHead />`, `<EmDashBodyStart />` and `<EmDashBodyEnd />`. If a component is missing, that placement silently renders nothing. The EmDash starter already includes all three.

```astro
---
// src/layouts/Base.astro
import { EmDashHead, EmDashBodyStart, EmDashBodyEnd } from "emdash/ui";
import { createPublicPageContext } from "emdash/page";
const pageCtx = createPublicPageContext({
  Astro,
  kind: "custom", // "content" on content pages
  pageType: "website",
  title: "My site",
});
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My site</title>
    <EmDashHead page={pageCtx} />
  </head>
  <body>
    <EmDashBodyStart page={pageCtx} />
    <slot />
    <EmDashBodyEnd page={pageCtx} />
  </body>
</html>
```

The EmDash starter's `src/layouts/Base.astro` is the reference for building `pageCtx`.

## Using it

Each snippet has these fields:

| Field | Default | Notes |
|---|---|---|
| `name` | required | Shown in the admin list only. Up to 200 characters. |
| `code` | required | Raw HTML (`<script>`, `<style>`, `<noscript>`, `<meta>`, …), output exactly as written. |
| `placement` | `"head"` | `"head"`, `"body:start"` or `"body:end"`. |
| `enabled` | `true` | Disabled snippets are never output. |
| `priority` | `10` | Integer. Lower runs first within the same placement. |
| `includePaths` | `[]` | Empty means every page. |
| `excludePaths` | `[]` | Empty means none. Exclude wins over include. |
| `pageKind` | `"all"` | `"all"`, `"content"` or `"custom"`. |
| `locales` | `[]` | Empty means all locales. A page with no locale never matches a non-empty list. |
| `meta` | `{}` | Reserved for extensions. See [Data model notes](#data-model-notes). |

**Path matching**

- A pattern must start with `/`, contain no whitespace, and may use `*` only as its final character. There is no regex.
- A pattern is either an exact path or a prefix ending in `*`.
- A trailing `/` is ignored on both the pattern and the path (except for `/` itself). Matching is case-sensitive.
- `/blog/*` matches `/blog/x` and `/blog/a/b`, but not `/blog`. List `/blog` separately to include it.
- If any exclude pattern matches, the snippet is not output, even if an include pattern also matches.
- Nothing is ever output on `/_emdash/` admin paths.

**Placements and priority.** Snippets are output in `priority` order (ascending), then by creation time, then by id. Each snippet goes to the head, the start of the body, or the end of the body, according to its placement.

## Kill switch

The "Output enabled" toggle at the top of the admin page disables all snippet output on every page without deleting or changing any snippet. Turning it off asks for confirmation. Turn it back on to resume.

## Permissions

| Role | Permission | Can do |
|---|---|---|
| Admin | `plugins:manage` | Everything: create, edit, enable, duplicate, delete, kill switch, view code. |
| Editor | `plugins:read` | Open the page and see the snippet list, read-only. The list does not include code, and the create, edit and kill-switch controls are hidden. |

Write requests from an Editor are rejected with HTTP 403. This is covered by the end-to-end tests.

## Change log

Every create, update, enable, disable, duplicate and delete, and every kill-switch change, is recorded with the time, the user and the snippet name. The admin page shows the latest 100 entries. v0.1 does not prune old entries.

## Limits

- 64 KB of code per snippet (UTF-8 bytes)
- 512 KB of code in total
- 100 snippets

Saving past a limit, or with an invalid path pattern, shows a validation error in the form and nothing is saved.

## Caching and freshness

- Changes reach every server instance within about 1 second.
- Pages served from an edge HTML cache (for example Cloudflare Workers Cache) update only after a purge. v0.1 does not purge automatically. For example:

  ```ts
  import { cache } from "cloudflare:workers";
  await cache.purge({ purgeEverything: true });
  ```

- Ordering relative to other plugins' page fragments is not guaranteed.

## Extending with transforms

A transform runs on each matched snippet before it is output:

```ts
type Transform = (ctx: TransformContext) => TransformResult;

interface TransformContext {
  snippet: Readonly<Snippet>;
  html: string; // the snippet code, or the previous transform's output
  page: Readonly<PageInfo>; // EmDash's public page context
}

type TransformResult =
  | string
  | null
  | { html: string | null; fragments?: PageFragmentContribution[] };
```

Transforms are synchronous and run in order.

- Return a **string** to replace the snippet HTML.
- Return **`null`** to drop the snippet.
- Return **`{ html, fragments }`** to replace the HTML (or drop it with `null`) and also contribute extra page fragments. Extra fragments are de-duplicated by `key`; the first wins.
- If a transform throws, the error is logged and that snippet is skipped. Other snippets are unaffected.

The types `Transform`, `TransformContext`, `TransformResult`, `Snippet` and `HeaderFooterCodeRuntimeOptions` are exported from `emdash-header-footer-code/plugin` (the first four also from the package root).

Descriptor options are JSON-serialised, so functions cannot be passed to `headerFooterCode()` directly. Instead, an extending package ships a wrapper entrypoint that calls `createPlugin` with its transforms:

```ts
// your-package/plugin.ts
import { createPlugin as base, type HeaderFooterCodeRuntimeOptions } from "emdash-header-footer-code/plugin";

export function createPlugin(options: HeaderFooterCodeRuntimeOptions = {}) {
  return base({
    ...options,
    transforms: [({ html }) => html.replaceAll("HFC_TRANSFORM_ME", "HFC_TRANSFORMED")],
  });
}
```

Then point the descriptor at it with a package specifier (not a relative path):

```js
plugins: [headerFooterCode({ entrypoint: "your-package/plugin" })]
```

`entrypoint` is a descriptor field and is not passed on as a plugin option.

## Data model notes

- `meta` is reserved for extensions (for example `meta.consentCategory`). It is stored and returned untouched, and unknown keys are preserved.
- Every snippet has a `schemaVersion` (currently `1`). A record with a newer `schemaVersion` than the installed code understands is passed through unchanged and never rewritten.

## Versioning

This package follows semver. Adding a capability is a major version, because native plugins have no consent prompt on upgrade.

## Development

```sh
pnpm install
pnpm test        # unit tests
pnpm typecheck
pnpm exec playwright install chromium   # once
pnpm e2e         # builds, then runs Playwright against an EmDash 1.0.1 starter in e2e/fixture
```

## Licence

MIT
