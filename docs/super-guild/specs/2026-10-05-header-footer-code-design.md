# Header & Footer Code plugin for EmDash — design

Date: 2026-10-05 · Author: @Jithin · Status: approved design, pre-plan

This document refines the original product spec ("Header & Footer Code plugin for EmDash — spec", 5 Oct 2026) into an implementable design. It resolves the spec's five open questions. Where this document and the original spec disagree, this document wins.

## 1. Summary

`emdash-header-footer-code` is a free, MIT-licensed, **native** EmDash plugin. It lets site admins manage a list of code snippets: verification tags, analytics pixels, chat widgets, custom CSS/JS. The plugin emits the snippets into `head`, `body:start` or `body:end` of public pages through the `page:fragments` hook. It is the EmDash equivalent of WPCode / Insert Headers and Footers. Target: EmDash `^1.0.1`.

## 2. Resolved open questions

| # | Question | Decision |
|---|---|---|
| 1 | Storage shape | Plugin storage **collection** `snippets` (one record per snippet), plus a `changelog` collection. Hot-path freshness comes from a tiny kv `state` record (see Q3). |
| 2 | Transform API | A context-object argument with a widened return type: `(ctx: { snippet, html, page }) => string \| null \| { html: string \| null; fragments?: PageFragmentContribution[] }`. Synchronous in v0.1. Allowing Promise returns later is non-breaking. |
| 3 | Cross-isolate cache invalidation | **Version key**: kv `state = { rev, disabled }` is bumped on every admin write. Each isolate caches the compiled snippet list keyed by `rev`. The state read is coalesced per isolate for 1 s. |
| 4 | Theme check | v0.1 has a permanent admin note and a README section only. An on-demand "Check theme" button (nonce query param that triggers marker fragments) is a v0.2 candidate. |
| 5 | Package scope / licence | Unscoped `emdash-header-footer-code`, MIT. The name was free on npm as of 2026-10-05. |

## 3. Platform facts this design relies on

Verified against the EmDash docs and `emdash-cms/emdash` source (main branch ≈ npm `emdash@1.1.0`):

- A native plugin has two parts:
  - A descriptor factory, which returns `{ id, version, format: "native", entrypoint, options, adminEntry }`.
  - A named `createPlugin(options)` export from `entrypoint`, which returns `definePlugin({ id, version, capabilities, storage, hooks, routes, admin })`.
- `capabilities: ["hooks.page-fragments:register"]` is required for the hook.
- The `page:fragments` hook:
  - The handler receives `{ page }`. The fields this design uses are `path`, `locale`, `kind`, `url` and `content`.
  - It returns a contribution, an array of contributions, or `null`. An `html` contribution is `{ kind: "html", placement, html, key? }`.
  - A duplicate `key` within a placement keeps the first.
  - Errors are caught and logged, and the page still renders.
  - Async handlers are allowed. The default timeout is 5000 ms.
- **The hook can be invoked up to 3 times per request.** On content pages with SEO data, each layout component gets a fresh page object, which defeats EmDash's per-request memo.
- Plugin storage collections:
  - All collections live in one SQL table (D1 on Workers).
  - `query({ where, orderBy, limit ≤ 100, cursor })` is one indexed SELECT.
  - Only indexed fields can be filtered or ordered.
- `ctx.kv` / `ctx.settings` live in the `options` table and are **not cached** by EmDash. They support `get`, `set`, `getVersioned` and `compareAndSet`.
- No hook fires when plugin settings change.
- Permissions: `plugins:manage` maps to Admin and `plugins:read` maps to Editor. Private routes get `ctx.user = { id, email, name, role }`.
- Admin pages:
  - Declared via `admin.pages`, served from the `./admin` export (shipped as TSX source).
  - They call routes with `apiFetch("/_emdash/api/plugins/<id>/<route>")` from `emdash/plugin-utils`.
- `<EmDashHead />`, `<EmDashBodyStart />` and `<EmDashBodyEnd />` render **no** marker of their own.
- Workers Cache (edge HTML caching) serves pages without invoking the hook.

## 4. Package layout

```
emdash-header-footer-code/
  package.json            # name, exports, peerDeps, keywords: ["emdash-plugin"]
  tsdown.config.ts
  src/
    index.ts              # "."        descriptor factory headerFooterCode(opts)
    plugin.ts             # "./plugin" createPlugin(opts) → definePlugin(...)
    hook.ts               # page:fragments adapter (thin)
    routes.ts             # route handlers
    cache.ts              # per-isolate state/snippet cache
    core/                 # pure, EmDash-independent, unit-tested
      types.ts            # Snippet, Placement, Transform, PageInfo, ...
      paths.ts            # pattern validation + compile to matcher
      match.ts            # snippet ↔ page matching
      pipeline.ts         # match → sort → transform → emit
      validate.ts         # field + size validation (shared with admin)
      fields.ts           # FIELDS definition array for the admin form
    admin/
      index.tsx           # "./admin" exports { pages }
      SnippetsPage.tsx
      SnippetList.tsx
      SnippetForm.tsx     # renders from core/fields.ts
      ChangeLog.tsx
      api.ts              # apiFetch wrappers
  test/                   # Vitest
  e2e/
    fixture/              # EmDash starter site with plugin linked locally
    *.spec.ts             # Playwright
  README.md
  LICENSE                 # MIT
```

- **Exports:**
  - `"."` → `dist/index.mjs`
  - `"./plugin"` → `dist/plugin.mjs`
  - `"./admin"` → `src/admin/index.tsx`, shipped as source per EmDash convention
- **Build:** tsdown builds the server entries (ESM + `.d.ts`). `files` includes `dist` and `src/admin` (plus `src/core` if the admin imports it).
- **Peer dependencies:** `emdash ^1.0.1`, `react`, and the admin-side libraries EmDash's reference plugins use (`@cloudflare/kumo`, `@emdash-cms/admin`, `@tanstack/react-query`, Lingui as needed).
- **Identifiers:** plugin id is `header-footer-code`. The descriptor and `definePlugin` share the same id and version.

Usage:

```js
// astro.config.mjs
import { headerFooterCode } from "emdash-header-footer-code";
emdash({ plugins: [headerFooterCode()] });
```

Transforms are runtime functions. They cannot travel through the serialisable descriptor `options`, so they are passed by the extending package (see §7).

## 5. Data model

### 5.1 `snippets` collection

```ts
interface Snippet {
  id: string;                 // generated (crypto.randomUUID)
  schemaVersion: 1;
  name: string;               // required, ≤ 200 chars
  code: string;               // required, ≤ 64 KB UTF-8
  placement: "head" | "body:start" | "body:end";   // default "head"
  enabled: boolean;           // default true
  priority: number;           // integer, default 10; lower first
  includePaths: string[];     // [] = every page
  excludePaths: string[];     // [] = none; exclude wins
  pageKind: "all" | "content" | "custom";          // default "all"
  locales: string[];          // [] = all locales
  meta: Record<string, unknown>; // default {}; stored and returned untouched
  createdAt: string;          // ISO timestamp
  updatedAt: string;
  createdBy: UserRef;
  updatedBy: UserRef;
}
type UserRef = { id: string; name: string | null; email: string | null };
```

Indexes: `createdAt`. Reserved for the future: `meta.consentCategory`.

Unknown keys in `meta` are preserved. When a record with a higher `schemaVersion` than the code understands is read, it is passed through unchanged and never rewritten.

### 5.2 `changelog` collection

```ts
interface ChangeLogEntry {
  id: string;
  at: string;                 // ISO timestamp
  user: UserRef;
  action: "create" | "update" | "enable" | "disable" | "duplicate" | "delete"
        | "killswitch_on" | "killswitch_off";
  snippetId: string | null;
  snippetName: string | null;
}
```

Indexes: `at`. The admin shows the latest 100. v0.1 has no pruning; this is documented.

### 5.3 kv `state`

```ts
interface PluginState { rev: number; disabled: boolean }  // missing ⇒ { rev: 0, disabled: false }
```

Every write route bumps `rev` via `getVersioned` + `compareAndSet`, retrying a few times on conflict. The global kill switch is `disabled`. The EmDash-generated settings form is **not** used: reading a setting would cost an extra uncached read per request.

### 5.4 Limits

- At most **100 snippets**, so the hook loads the whole list in a single `query`.
- At most **64 KB** of `code` per snippet and **512 KB** across all snippets, measured in UTF-8 bytes.

## 6. Render pipeline (`page:fragments`)

1. **Admin skip:** if `page.path` starts with `/_emdash/`, return `null`.
2. **State:** `getState()` returns `{ rev, disabled }`.
   - The read is coalesced per isolate: one in-flight promise, reused for 1 s.
   - Most requests therefore cost one small kv read or none, including the hook's up-to-3 invocations per request.
   - If `disabled`, return `null`.
3. **Snippets:** if `rev` differs from the cached rev, run one `query` on `snippets` and rebuild the cache:
   - Keep only `enabled` snippets.
   - Sort by `(priority asc, createdAt asc, id asc)`.
   - Compile include/exclude patterns into matchers.
   - If a snippet's patterns fail to compile, mark it invalid. It is skipped and logged once per rebuild.
4. **Match** (pure, `core/match.ts`). A snippet matches when all of these hold:
   - `pageKind === "all"`, or `pageKind === page.kind`.
   - `locales` is empty, or `page.locale` is in `locales`. A missing `page.locale` with non-empty `locales` means no match.
   - `includePaths` is empty, or some include pattern matches.
   - No exclude pattern matches.
5. **Path patterns** (`core/paths.ts`):
   - A pattern must start with `/`, contain no whitespace, and contain `*` only as its final character.
   - Normalisation: strip a trailing `/` from both pattern and path, except for `/` itself. No case folding.
   - An exact pattern matches the normalised path exactly.
   - `/prefix*` matches when the path starts with `/prefix`. So `/blog/*` matches `/blog/x` and `/blog/a/b`, but not `/blog`. `/blog/draft-*` matches `/blog/draft-x`.
   - No regex.
6. **Transform:** for each matched snippet, run `[...BUILTIN_TRANSFORMS (empty), ...options.transforms]` in order, threading `html`.
   - Each call is wrapped in try/catch.
   - A transform that returns `null` drops the snippet.
   - A transform that throws gets the error logged with the snippet id and transform index, and that snippet is dropped. Others continue.
   - `fragments` returned by a transform are collected.
7. **Emit:** each surviving snippet becomes `{ kind: "html", placement, html, key: "hfc-<id>" }`.
   - Transform `fragments` are appended after the snippets, deduplicated by `key`; the first one wins. Contributions without a key are kept.
   - Snippet order is the sort order from step 3.
8. The whole handler is wrapped so that an unexpected error is logged and returns `null`. EmDash would catch it anyway; this keeps the log message ours.

**Security rules for the hook:**
- It never interpolates request data or content into snippet HTML.
- It never reads host secrets.
- It makes no network calls and sets no cookies.

**Documented caveats:**
- Ordering relative to other plugins' fragments is not guaranteed.
- With Workers Cache, or any edge HTML cache, changes appear only after a purge. v0.1 does not purge automatically.
- Another isolate can take up to 1 s to see a change.
- A missing layout component means that placement renders nothing.

**Performance target:** under 2 ms hook time per request with 50 snippets on a warm cache. On a hot request the work is one possibly coalesced kv read plus an in-memory filter.

## 7. Extension points

1. **`meta` + `schemaVersion`** on every record (§5.1).
2. **Pipeline with a transform step** (§6.6):
   ```ts
   export type Transform = (ctx: TransformContext) => TransformResult;
   export interface TransformContext { snippet: Readonly<Snippet>; html: string; page: Readonly<PageInfo> }
   export type TransformResult = string | null | { html: string | null; fragments?: PageFragmentContribution[] };
   ```
   New fields can be added to `TransformContext` without a breaking change.
3. **Injectable transforms.** `createPlugin({ transforms })` appends to the built-in list. Because descriptor options must be serialisable, an extending package passes them through its own wrapper entrypoint:
   ```ts
   // e.g. @cookieyes/emdash-consent/hfc-plugin.ts
   import { createPlugin as base } from "emdash-header-footer-code/plugin";
   export const createPlugin = (opts) => base({ ...opts, transforms: [consentTransform] });
   ```
   The descriptor factory accepts an `entrypoint` override, defaulting to `"emdash-header-footer-code/plugin"`, so a site registers `headerFooterCode({ entrypoint: "@cookieyes/emdash-consent/hfc-plugin" })`. The planner must verify the loader accepts this pattern in the e2e fixture. If it does not, fall back to a documented re-export pattern.
4. **Field-driven admin form.** `core/fields.ts` exports `FIELDS: FieldDef[]`:
   ```ts
   interface FieldDef {
     name: string;              // "name" | "code" | ... | "meta.consentCategory"
     label: string;
     type: "text" | "code" | "select" | "toggle" | "number" | "pathList" | "localeList";
     options?: { value: string; label: string }[];
     help?: string;
     required?: boolean;
     manageOnly?: boolean;      // hidden from plugins:read viewers (true for "code")
   }
   ```
   `SnippetForm` renders from this list. Dotted names read and write into `meta`.

## 8. Routes

Base path: `/_emdash/api/plugins/header-footer-code/`.

| Route | Permission | Behaviour |
|---|---|---|
| `snippets.list` | `plugins:read` | All snippets plus `{ disabled }`. `code` is omitted unless the caller has `plugins:manage`. |
| `snippets.get` | `plugins:manage` | One full snippet. |
| `snippets.save` | `plugins:manage` | Create (no id) or update (id). Validates, writes, logs `create`/`update`, bumps rev. |
| `snippets.toggle` | `plugins:manage` | `{ id, enabled }`. Logs `enable`/`disable`, bumps rev. |
| `snippets.duplicate` | `plugins:manage` | Copy with name + " (copy)", **disabled**, new id/timestamps, `meta` copied. Logs `duplicate`, bumps rev. Subject to limits. |
| `snippets.delete` | `plugins:manage` | Logs `delete` (keeps the name in the log), bumps rev. |
| `killswitch.set` | `plugins:manage` | `{ disabled }`. Logs `killswitch_on`/`off`, bumps rev. |
| `changelog.list` | `plugins:manage` | Latest 100 entries, newest first. |

If `snippets.list` cannot cleanly detect `plugins:manage` from `ctx.user.role`, split it into `snippets.list` (manage, with code) and `snippets.summary` (read, without code).

Write flow: validate, write the record, append to the change log, bump rev, return the updated record. `ctx.user` supplies `createdBy`, `updatedBy` and the change-log user.

**Validation** (`core/validate.ts`, shared with the admin form for instant feedback; the server is the authority):
- `name` is required and at most 200 characters.
- `code` is required and at most 64 KB.
- Total code across all snippets, including this one, is at most 512 KB.
- There are at most 100 snippets.
- `placement` and `pageKind` must be valid enum values.
- `priority` must be an integer.
- Every path must pass the pattern rules.
- `locales` must be non-empty strings.
- `meta` must be a plain JSON object.

Errors come back as `{ errors: { [field]: message } }`, with human-readable sizes (for example "Code is 70.2 KB; the limit is 64 KB per snippet").

## 9. Admin UI

One page under Plugins: **"Header & Footer Code"** (`admin.pages: [{ path: "/", label: "Header & Footer Code" }]`).

- **Theme note (permanent):** "Snippets only render if your theme's layout includes `<EmDashHead />`, `<EmDashBodyStart />` and `<EmDashBodyEnd />` for the matching placements."
- **Kill switch:**
  - A toggle, "Output enabled".
  - When off, a prominent banner reads "All snippet output is disabled".
  - Turning it off asks for confirmation.
- **List tab:**
  - Columns: name, placement, enabled (inline toggle), priority, last updated.
  - Row actions: edit, duplicate, delete (confirmation dialog).
  - A "New snippet" button.
  - Editors (`plugins:read`) see a read-only list: no toggles, no actions, no code.
- **Edit view:**
  - Rendered from `FIELDS`. The code field is a monospace textarea.
  - Path lists and locale lists are one entry per line.
  - Shows validation errors inline.
- **Change log tab:** time, user, action, snippet name.
- **Libraries:** built with `@cloudflare/kumo` components and `@tanstack/react-query`, following EmDash's reference plugins.

## 10. Testing

**Vitest** (unit; `core/` is pure, and routes and hook run against a fake `ctx` with in-memory storage and kv):
- **Path patterns:** exact paths, trailing `*`, normalisation, `/blog/*` vs `/blog`, malformed patterns rejected.
- **Acceptance case:** include `/blog/*` with exclude `/blog/draft-*` matches `/blog/hello`, but not `/blog/draft-x` or `/about`.
- **Matching:** page kind and locale filters.
- **Ordering:** priority, then createdAt, within a placement.
- **Skips:** admin-path skip; the kill switch emits nothing.
- **Size limits:** 64 KB, 512 KB and 100 snippets, with error messages.
- **`meta`:** a nested object round-trips unchanged, and `schemaVersion` is 1.
- **Transforms:**
  - a rewriting transform is applied;
  - a `null` return skips the snippet;
  - a throwing transform is logged and skipped while others render;
  - `fragments` are deduplicated by key.
- **Cache:** an unchanged rev costs no query; a bumped rev reloads; the state read is coalesced within 1 s.
- **Routes:** read access omits code; write routes declare `plugins:manage`; each write appends a change-log entry with the user and bumps rev; duplicate produces a disabled copy.

**Playwright** (e2e):
- **Fixture:** the EmDash 1.0.x starter template in `e2e/fixture/`, with the plugin linked as a workspace package, running `astro dev` on SQLite. The fixture config also registers a test transform via the wrapper-entrypoint pattern.
- **Tests:**
  - Log in as admin and create one snippet per placement through the UI.
  - On a public page, assert the head snippet is inside `<head>`, the body:start snippet is the first element of `<body>`, and the body:end snippet comes after the page content.
  - Assert none of them appear on `/_emdash/admin`.
  - Disable a snippet in the list and check it is gone on the next load.
  - Log in as an Editor and confirm there are no create or edit controls and no code.
  - Confirm the test transform's rewrite appears in the output.

**CI:** GitHub Actions runs typecheck, lint, Vitest and Playwright on every PR. A tagged release runs `npm publish --provenance`.

## 11. Release and docs

- **Versioning:** semver. Adding a capability is a major bump.
- **README:**
  - install and `astro.config.mjs`;
  - the declared capability and why;
  - the three layout components;
  - the kill switch;
  - the transforms API with a typed example and the wrapper-entrypoint pattern;
  - limits;
  - caveats (§6);
  - security: "runs as first-party code with no permission sandbox; only Admins can edit; snippet HTML is intentionally unsanitised".
- **Visibility checklist** (non-code): publish with the `emdash-plugin` keyword, open a PR to awesome-emdash, post in EmDash GitHub Discussions "Show and tell", write a build-log post.

## 12. Out of scope for v0.1

- Consent gating. Planned as a transform once the consent plugin is ready.
- Server-side code execution.
- Per-entry snippets.
- Regex, device or role targeting, and scheduling.
- WPCode/IHAF import (v0.2 candidate).
- Theme auto-detection (v0.2 candidate).
- Automatic edge-cache purge.
- Change-log pruning.
- A syntax-highlighted editor.
- A sandboxed or registry version.

## 13. Acceptance criteria

Unchanged from the original spec, with one addition: the kill switch suppresses all output on the next uncached page load, with no redeploy.
