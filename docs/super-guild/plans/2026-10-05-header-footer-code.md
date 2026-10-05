# Header & Footer Code Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use super-guild:subagent-driven-development (recommended) or super-guild:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish `emdash-header-footer-code`, a native EmDash plugin that emits admin-managed code snippets into `head`, `body:start` or `body:end` of public pages.

**Architecture:**
- A pure, EmDash-independent core in `src/core/` handles path matching, ordering, the transform pipeline, validation and form fields. It is fully unit-tested.
- A thin runtime layer wires the core to EmDash:
  - `src/cache.ts`: a per-isolate cache keyed by a kv `rev`;
  - `src/hook.ts`: the `page:fragments` adapter;
  - `src/routes.ts`: admin API routes;
  - `src/plugin.ts`: `createPlugin` → `definePlugin`.
- A React admin page in `src/admin/` is shipped as source.
- A Playwright suite drives a local EmDash 1.0.1 starter site with the plugin linked through a pnpm workspace.

**Tech Stack:** TypeScript (ESM), EmDash 1.0.1 plugin API, React 19, `@cloudflare/kumo` 2.6.0, tsdown 0.20.3, Vitest 4.1.10, Playwright, pnpm workspaces, Astro 7 (fixture only).

**Spec:** `docs/super-guild/specs/2026-10-05-header-footer-code-design.md`. Read it before starting any task.

**EmDash reference source:** clone tag `emdash@1.0.1` if you need to check an API:
`git clone --depth 1 --branch emdash@1.0.1 https://github.com/emdash-cms/emdash /tmp/emdash-src`

Useful files in that clone:
- `packages/core/src/plugins/types.ts`: `StorageCollection`, `KVAccess`, `PublicPageContext`, `PageFragmentContribution`, `RouteContext`, `PluginRoute`
- `packages/core/src/plugins/define-plugin.ts`
- `packages/core/src/plugins/routes.ts`: how route errors become responses
- `packages/core/src/plugin-utils.ts`: `apiFetch`, `parseApiResponse`
- `packages/plugins/ai-moderation/`: reference native plugin with an admin page

## Global Constraints

- **Package:** name `emdash-header-footer-code`, licence MIT, `"type": "module"`, keywords include `"emdash-plugin"`.
- **Plugin identity:** id `header-footer-code`, version `0.1.0`. The id and version must be identical in the descriptor (`src/index.ts`) and in `definePlugin` (`src/plugin.ts`). Export both from `src/version.ts`.
- **Peer dependencies:** `emdash ^1.0.1`, `react ^18.0.0 || ^19.0.0`, `@cloudflare/kumo ^2.6.0`. Dev-dependency pins: `emdash 1.0.1`, `react 19.2.4`, `@cloudflare/kumo 2.6.0`.
- **Capability:** exactly `["hooks.page-fragments:register"]`. Adding any capability is a major version bump.
- **Placements:** `"head" | "body:start" | "body:end"`. Page kinds: `"all" | "content" | "custom"`.
- **Snippet defaults:**

  | Field | Default |
  |---|---|
  | placement | `"head"` |
  | enabled | `true` |
  | priority | `10` |
  | includePaths | `[]` |
  | excludePaths | `[]` |
  | pageKind | `"all"` |
  | locales | `[]` |
  | meta | `{}` |
  | schemaVersion | `1` |

- **Limits:** code ≤ 64 KB (65,536 UTF-8 bytes) per snippet; total code ≤ 512 KB (524,288 bytes); ≤ 100 snippets; name ≤ 200 characters.
- **Fragment key:** `hfc-<snippet id>`. Fragment kind is always `"html"`.
- **Admin paths:** never emit anything when `page.path` starts with `/_emdash/`.
- **Path patterns:** exact match, or a single trailing `*` only. Must start with `/`. No whitespace. No regex.
- **Ordering:** `priority` ascending, then `createdAt` ascending, then `id` ascending.
- **Cross-isolate freshness:**
  - kv key `state` holds `{ rev: number, disabled: boolean }`; when missing, use `{ rev: 0, disabled: false }`.
  - The state read is coalesced per isolate for **1000 ms**.
  - Every admin write bumps `rev` with `getVersioned` + `compareAndSet`, up to 5 attempts.
- **Permissions:**
  - `plugins:manage` (Admin, role ≥ 50) for every route except `snippets/list`, which is `plugins:read` (Editor, role ≥ 40).
  - `snippets/list` omits `code` unless `ctx.user.role >= 50`.
- **No network calls, no cookies.** Never interpolate request or content data into snippet HTML.
- **Transforms:** `(ctx: { snippet, html, page }) => string | null | { html: string | null; fragments?: PageFragmentContribution[] }`, synchronous.
- **Transform injection:** descriptor options are JSON-serialised, so transforms are injected through a wrapper module's `createPlugin`. The descriptor accepts an `entrypoint` override, and `entrypoint` is removed from `options`.
- **Admin page:** path `"/snippets"`, label `"Header & Footer Code"`. This is a deliberate deviation from spec §9's `"/"`, matching EmDash's reference plugins.
- **Route names** use slash style, matching EmDash's reference plugins: `snippets/list`, `snippets/get`, `snippets/save`, `snippets/toggle`, `snippets/duplicate`, `snippets/delete`, `killswitch/set`, `changelog/list`. Never name a route `admin`, which is reserved by EmDash.
- **Admin UI state:** plain React state and `fetch`, following `ai-moderation`. No react-query. This simplifies spec §9's library note.
- **Commits:** end every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.json, tsdown.config.ts, vitest.config.ts, LICENSE, .gitignore
src/
  version.ts            PLUGIN_ID, PLUGIN_VERSION
  index.ts              "."        headerFooterCode(opts) descriptor factory
  plugin.ts             "./plugin" createPlugin(opts) → definePlugin
  hook.ts               createFragmentsHandler(cache, transforms)
  cache.ts              createSnippetCache() — per-isolate state + compiled list
  state.ts              readState / bumpState (kv `state`)
  repo.ts               typed storage helpers (loadAllSnippets, appendLog, userRef)
  routes.ts             createRoutes(deps) — all admin API routes
  core/
    types.ts            Snippet, Placement, PageKind, Transform, ...
    paths.ts            validatePattern, normalizePath, compilePattern
    match.ts            compileSnippet, prepareSnippets, matchesPage, isAdminPath
    pipeline.ts         renderFragments
    validate.ts         LIMITS, byteLength, validateSnippetInput, checkLimits
    fields.ts           FIELDS, getFieldValue, setFieldValue, emptyDraft
  admin/
    index.tsx           exports { pages }
    api.ts              typed apiFetch wrappers
    SnippetsPage.tsx    tabs, theme note, kill switch, view routing
    SnippetList.tsx
    SnippetForm.tsx
    ChangeLog.tsx
test/
  fakes.ts              in-memory storage collection, kv, logger, page factory
  *.test.ts
e2e/
  fixture/              EmDash 1.0.1 starter + plugin (pnpm workspace member)
  test-transform/       wrapper package injecting a test transform
  playwright.config.ts, helpers.ts, *.spec.ts
.github/workflows/ci.yml, .github/workflows/release.yml
README.md
docs/super-guild/launch-checklist.md
```

---

### Task 1: Package scaffold and path patterns

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `LICENSE`, `.gitignore`, `src/version.ts`, `src/core/types.ts`, `src/core/paths.ts`
- Test: `test/paths.test.ts`

**Interfaces:**
- Produces:
  - `src/core/types.ts`: `Placement`, `PageKind`, `UserRef`, `Snippet`, `EditableSnippet`, `PluginState`, `ChangeLogAction`, `ChangeLogEntry`, `PageInfo`, `Transform`, `TransformContext`, `TransformResult`, `Logger`, `PLACEMENTS`, `PAGE_KINDS`, `DEFAULT_STATE`
  - `src/core/paths.ts`: `validatePattern(p: string): string | null`, `normalizePath(p: string): string`, `compilePattern(p: string): PathMatcher` (throws on invalid), `type PathMatcher = (path: string) => boolean`
  - `src/version.ts`: `PLUGIN_ID = "header-footer-code"`, `PLUGIN_VERSION = "0.1.0"`

- [ ] **Step 1: Create the package files**

`package.json`:
```json
{
  "name": "emdash-header-footer-code",
  "version": "0.1.0",
  "description": "Add custom code snippets (analytics, verification tags, chat widgets, CSS/JS) to the head or body of EmDash pages — no theme edits.",
  "type": "module",
  "license": "MIT",
  "keywords": ["emdash", "emdash-plugin", "cms", "header", "footer", "snippets", "analytics"],
  "exports": {
    ".": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
    "./plugin": { "types": "./dist/plugin.d.mts", "default": "./dist/plugin.mjs" },
    "./admin": "./src/admin/index.tsx"
  },
  "files": ["dist", "src/admin", "src/core", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "e2e": "pnpm build && playwright test -c e2e/playwright.config.ts"
  },
  "peerDependencies": {
    "emdash": "^1.0.1",
    "react": "^18.0.0 || ^19.0.0",
    "@cloudflare/kumo": "^2.6.0"
  },
  "devDependencies": {
    "@cloudflare/kumo": "2.6.0",
    "@playwright/test": "^1.56.0",
    "@types/react": "19.2.14",
    "better-sqlite3": "^12.4.1",
    "@types/better-sqlite3": "^7.6.13",
    "emdash": "1.0.1",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "tsdown": "0.20.3",
    "typescript": "^6.0.3",
    "vitest": "4.1.10"
  },
  "packageManager": "pnpm@10.18.0"
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "e2e/fixture"
  - "e2e/test-transform"
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "preserve",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["es2024", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "declaration": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

`tsdown.config.ts`:
```ts
import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/plugin.ts"],
	format: "esm",
	dts: true,
	clean: true,
	external: ["emdash", /^emdash\//],
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

`.gitignore`:
```
node_modules
dist
e2e/fixture/data.db*
e2e/fixture/uploads
e2e/fixture/.astro
test-results
playwright-report
```

`LICENSE`: the standard MIT licence text, `Copyright (c) 2026 Jithin`.

`src/version.ts`:
```ts
export const PLUGIN_ID = "header-footer-code";
export const PLUGIN_VERSION = "0.1.0";
```

- [ ] **Step 2: Write `src/core/types.ts`**

```ts
import type { PageFragmentContribution, PublicPageContext } from "emdash";

export const PLACEMENTS = ["head", "body:start", "body:end"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export const PAGE_KINDS = ["all", "content", "custom"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export interface UserRef {
	id: string;
	name: string | null;
	email: string | null;
}

/** Fields an admin edits. */
export interface EditableSnippet {
	name: string;
	code: string;
	placement: Placement;
	enabled: boolean;
	priority: number;
	includePaths: string[];
	excludePaths: string[];
	pageKind: PageKind;
	locales: string[];
	meta: Record<string, unknown>;
}

export interface Snippet extends EditableSnippet {
	id: string;
	schemaVersion: number; // 1 in v0.1
	createdAt: string; // ISO
	updatedAt: string; // ISO
	createdBy: UserRef;
	updatedBy: UserRef;
}

export interface PluginState {
	rev: number;
	disabled: boolean;
}
export const DEFAULT_STATE: PluginState = { rev: 0, disabled: false };

export type ChangeLogAction =
	| "create"
	| "update"
	| "enable"
	| "disable"
	| "duplicate"
	| "delete"
	| "killswitch_on"
	| "killswitch_off";

export interface ChangeLogEntry {
	id: string;
	at: string;
	user: UserRef;
	action: ChangeLogAction;
	snippetId: string | null;
	snippetName: string | null;
}

export type PageInfo = PublicPageContext;

export interface TransformContext {
	snippet: Readonly<Snippet>;
	html: string;
	page: Readonly<PageInfo>;
}
export type TransformResult =
	| string
	| null
	| { html: string | null; fragments?: PageFragmentContribution[] };
export type Transform = (ctx: TransformContext) => TransformResult;

export interface Logger {
	warn(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
}
```

- [ ] **Step 3: Install and write the failing path tests**

Run: `pnpm install` (pnpm warns that the workspace member folders are empty; that is expected until Task 9).

`test/paths.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { compilePattern, normalizePath, validatePattern } from "../src/core/paths.js";

describe("validatePattern", () => {
	it.each(["/", "/about", "/blog/*", "/*", "/blog/draft-*"])("accepts %s", (p) => {
		expect(validatePattern(p)).toBeNull();
	});
	it.each([
		["", "Path must start with /"],
		["blog", "Path must start with /"],
		["*", "Path must start with /"],
		["/bl*og", "* is only allowed at the end of a path"],
		["/a/**", "* is only allowed at the end of a path"],
		["/a b", "Path must not contain whitespace"],
	])("rejects %j", (p, msg) => {
		expect(validatePattern(p)).toBe(msg);
	});
});

describe("normalizePath", () => {
	it("strips trailing slashes except root", () => {
		expect(normalizePath("/blog/")).toBe("/blog");
		expect(normalizePath("/blog//")).toBe("/blog");
		expect(normalizePath("/")).toBe("/");
		expect(normalizePath("/About")).toBe("/About");
	});
});

describe("compilePattern", () => {
	it("matches exact paths with trailing-slash normalisation", () => {
		const m = compilePattern("/about/");
		expect(m("/about")).toBe(true);
		expect(m("/about/")).toBe(true);
		expect(m("/about/team")).toBe(false);
		expect(m("/About")).toBe(false);
	});
	it("matches root exactly", () => {
		const m = compilePattern("/");
		expect(m("/")).toBe(true);
		expect(m("/x")).toBe(false);
	});
	it("trailing * matches by prefix", () => {
		const m = compilePattern("/blog/*");
		expect(m("/blog/hello")).toBe(true);
		expect(m("/blog/a/b")).toBe(true);
		expect(m("/blog")).toBe(false);
		expect(m("/blog/")).toBe(false);
		expect(m("/blogger")).toBe(false);
	});
	it("prefix wildcard without slash", () => {
		const m = compilePattern("/blog/draft-*");
		expect(m("/blog/draft-x")).toBe(true);
		expect(m("/blog/hello")).toBe(false);
	});
	it("/* matches everything", () => {
		expect(compilePattern("/*")("/anything/here")).toBe(true);
	});
	it("throws on invalid patterns", () => {
		expect(() => compilePattern("/bl*og")).toThrow("* is only allowed at the end of a path");
	});
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run test/paths.test.ts`
Expected: FAIL. Cannot find module `../src/core/paths.js`.

- [ ] **Step 5: Implement `src/core/paths.ts`**

```ts
export type PathMatcher = (path: string) => boolean;

const WHITESPACE = /\s/;
const TRAILING_SLASHES = /\/+$/;

/** Returns an error message, or null when the pattern is valid. */
export function validatePattern(pattern: string): string | null {
	if (!pattern.startsWith("/")) return "Path must start with /";
	if (WHITESPACE.test(pattern)) return "Path must not contain whitespace";
	const star = pattern.indexOf("*");
	if (star !== -1 && star !== pattern.length - 1) return "* is only allowed at the end of a path";
	return null;
}

/** Strip trailing slashes, keeping "/" for the root. Case-sensitive. */
export function normalizePath(path: string): string {
	if (path === "/") return path;
	const stripped = path.replace(TRAILING_SLASHES, "");
	return stripped === "" ? "/" : stripped;
}

/** Compile a validated pattern into a matcher. Throws on invalid patterns. */
export function compilePattern(pattern: string): PathMatcher {
	const error = validatePattern(pattern);
	if (error) throw new Error(error);
	if (pattern.endsWith("*")) {
		const prefix = pattern.slice(0, -1);
		return (path) => normalizePath(path).startsWith(prefix);
	}
	const exact = normalizePath(pattern);
	return (path) => normalizePath(path) === exact;
}
```

Note: for `/blog/*` the prefix is `/blog/`. A normalised `/blog/` becomes `/blog`, so it does not match. This is intended.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run test/paths.test.ts && pnpm typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold package and path pattern matching

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Snippet matching and ordering

**Files:**
- Create: `src/core/match.ts`, `test/fakes.ts`
- Test: `test/match.test.ts`

**Interfaces:**
- Consumes: `compilePattern`, `PathMatcher` (Task 1); `Snippet`, `PageInfo`, `Logger` (Task 1).
- Produces:
  - `interface CompiledSnippet { snippet: Snippet; include: PathMatcher[]; exclude: PathMatcher[] }`
  - `compileSnippet(s: Snippet): CompiledSnippet` (throws on an invalid pattern)
  - `compareSnippets(a: Snippet, b: Snippet): number`
  - `prepareSnippets(list: Snippet[], log: Logger): CompiledSnippet[]`: keeps enabled snippets, sorts them, compiles them, and skips and logs invalid ones
  - `matchesPage(c: CompiledSnippet, page: PageInfo): boolean`
  - `isAdminPath(path: string): boolean`
  - From `test/fakes.ts`: `makeSnippet(overrides?: Partial<Snippet>): Snippet`, `makePage(overrides?: Partial<PageInfo>): PageInfo`, `makeLogger(): Logger & { warns: unknown[][]; errors: unknown[][] }`

- [ ] **Step 1: Write the test fakes (`test/fakes.ts`, first part; Task 5 extends it)**

```ts
import type { Logger, PageInfo, Snippet } from "../src/core/types.js";

let seq = 0;
export function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
	seq += 1;
	const user = { id: "u1", name: "Admin", email: "admin@example.com" };
	return {
		id: `s${seq}`,
		schemaVersion: 1,
		name: `Snippet ${seq}`,
		code: `<!-- snippet ${seq} -->`,
		placement: "head",
		enabled: true,
		priority: 10,
		includePaths: [],
		excludePaths: [],
		pageKind: "all",
		locales: [],
		meta: {},
		createdAt: new Date(Date.UTC(2026, 9, 5, 0, 0, seq)).toISOString(),
		updatedAt: new Date(Date.UTC(2026, 9, 5, 0, 0, seq)).toISOString(),
		createdBy: user,
		updatedBy: user,
		...overrides,
	};
}

export function makePage(overrides: Partial<PageInfo> = {}): PageInfo {
	return {
		url: "https://example.com/",
		path: "/",
		locale: null,
		kind: "custom",
		pageType: "home",
		title: null,
		description: null,
		canonical: null,
		image: null,
		...overrides,
	};
}

export function makeLogger() {
	const warns: unknown[][] = [];
	const errors: unknown[][] = [];
	const log: Logger & { warns: unknown[][]; errors: unknown[][] } = {
		warns,
		errors,
		warn: (...args: unknown[]) => void warns.push(args),
		error: (...args: unknown[]) => void errors.push(args),
	};
	return log;
}
```

- [ ] **Step 2: Write the failing tests (`test/match.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import {
	compileSnippet,
	isAdminPath,
	matchesPage,
	prepareSnippets,
} from "../src/core/match.js";
import { makeLogger, makePage, makeSnippet } from "./fakes.js";

const matches = (overrides: Parameters<typeof makeSnippet>[0], page: Parameters<typeof makePage>[0]) =>
	matchesPage(compileSnippet(makeSnippet(overrides)), makePage(page));

describe("isAdminPath", () => {
	it("detects /_emdash/ paths", () => {
		expect(isAdminPath("/_emdash/admin")).toBe(true);
		expect(isAdminPath("/_emdash/")).toBe(true);
		expect(isAdminPath("/_emdashx")).toBe(false);
		expect(isAdminPath("/blog")).toBe(false);
	});
});

describe("matchesPage", () => {
	it("empty include matches every page", () => {
		expect(matches({}, { path: "/anything" })).toBe(true);
	});
	it("acceptance: include /blog/* exclude /blog/draft-*", () => {
		const o = { includePaths: ["/blog/*"], excludePaths: ["/blog/draft-*"] };
		expect(matches(o, { path: "/blog/hello" })).toBe(true);
		expect(matches(o, { path: "/blog/draft-x" })).toBe(false);
		expect(matches(o, { path: "/about" })).toBe(false);
	});
	it("exclude wins over include", () => {
		expect(matches({ includePaths: ["/a"], excludePaths: ["/a"] }, { path: "/a" })).toBe(false);
	});
	it("filters by page kind", () => {
		expect(matches({ pageKind: "content" }, { kind: "content" })).toBe(true);
		expect(matches({ pageKind: "content" }, { kind: "custom" })).toBe(false);
		expect(matches({ pageKind: "all" }, { kind: "custom" })).toBe(true);
	});
	it("filters by locale", () => {
		expect(matches({ locales: [] }, { locale: "fr" })).toBe(true);
		expect(matches({ locales: ["en", "fr"] }, { locale: "fr" })).toBe(true);
		expect(matches({ locales: ["en"] }, { locale: "fr" })).toBe(false);
		expect(matches({ locales: ["en"] }, { locale: null })).toBe(false);
	});
});

describe("prepareSnippets", () => {
	it("drops disabled snippets", () => {
		const out = prepareSnippets([makeSnippet({ enabled: false }), makeSnippet()], makeLogger());
		expect(out).toHaveLength(1);
	});
	it("sorts by priority, then createdAt, then id", () => {
		const a = makeSnippet({ priority: 20, createdAt: "2026-01-01T00:00:00.000Z" });
		const b = makeSnippet({ priority: 5, createdAt: "2026-01-03T00:00:00.000Z" });
		const c = makeSnippet({ priority: 5, createdAt: "2026-01-02T00:00:00.000Z" });
		const d = makeSnippet({ id: "a-first", priority: 5, createdAt: "2026-01-02T00:00:00.000Z" });
		const out = prepareSnippets([a, b, c, d], makeLogger()).map((x) => x.snippet.id);
		expect(out).toEqual(["a-first", c.id, b.id, a.id]);
	});
	it("skips and logs snippets with malformed patterns", () => {
		const log = makeLogger();
		const bad = makeSnippet({ includePaths: ["/bl*og"] });
		const good = makeSnippet();
		const out = prepareSnippets([bad, good], log);
		expect(out.map((x) => x.snippet.id)).toEqual([good.id]);
		expect(log.warns).toHaveLength(1);
		expect(JSON.stringify(log.warns[0])).toContain(bad.id);
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run test/match.test.ts`
Expected: FAIL. Cannot find module `../src/core/match.js`.

- [ ] **Step 4: Implement `src/core/match.ts`**

```ts
import { compilePattern, type PathMatcher } from "./paths.js";
import type { Logger, PageInfo, Snippet } from "./types.js";

export interface CompiledSnippet {
	snippet: Snippet;
	include: PathMatcher[];
	exclude: PathMatcher[];
}

export function isAdminPath(path: string): boolean {
	return path.startsWith("/_emdash/");
}

export function compileSnippet(snippet: Snippet): CompiledSnippet {
	return {
		snippet,
		include: snippet.includePaths.map(compilePattern),
		exclude: snippet.excludePaths.map(compilePattern),
	};
}

export function compareSnippets(a: Snippet, b: Snippet): number {
	if (a.priority !== b.priority) return a.priority - b.priority;
	if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Enabled snippets, sorted, with compiled matchers. Invalid ones are skipped and logged. */
export function prepareSnippets(list: Snippet[], log: Logger): CompiledSnippet[] {
	const out: CompiledSnippet[] = [];
	for (const snippet of [...list].sort(compareSnippets)) {
		if (!snippet.enabled) continue;
		try {
			out.push(compileSnippet(snippet));
		} catch (error) {
			log.warn("Skipping snippet with an invalid path pattern", {
				snippetId: snippet.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return out;
}

export function matchesPage(c: CompiledSnippet, page: PageInfo): boolean {
	const { snippet } = c;
	if (snippet.pageKind !== "all" && snippet.pageKind !== page.kind) return false;
	if (snippet.locales.length > 0 && (page.locale === null || !snippet.locales.includes(page.locale))) {
		return false;
	}
	if (c.include.length > 0 && !c.include.some((m) => m(page.path))) return false;
	if (c.exclude.some((m) => m(page.path))) return false;
	return true;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run test/match.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: snippet matching and priority ordering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Render pipeline with transforms

**Files:**
- Create: `src/core/pipeline.ts`
- Test: `test/pipeline.test.ts`

**Interfaces:**
- Consumes: `CompiledSnippet`, `matchesPage` (Task 2); `Transform`, `PageInfo`, `Logger` (Task 1); `PageFragmentContribution` from `emdash`.
- Produces: `renderFragments(compiled: CompiledSnippet[], page: PageInfo, transforms: readonly Transform[], log: Logger): PageFragmentContribution[]`. The admin-path check and the kill switch are handled by the hook (Task 6), not here.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { prepareSnippets } from "../src/core/match.js";
import { renderFragments } from "../src/core/pipeline.js";
import type { Transform } from "../src/core/types.js";
import { makeLogger, makePage, makeSnippet } from "./fakes.js";

function run(snippets: ReturnType<typeof makeSnippet>[], transforms: Transform[] = [], page = makePage()) {
	const log = makeLogger();
	const out = renderFragments(prepareSnippets(snippets, log), page, transforms, log);
	return { out, log };
}

describe("renderFragments", () => {
	it("emits one html fragment per matching snippet with key hfc-<id>", () => {
		const s = makeSnippet({ placement: "body:end", code: "<script>x()</script>" });
		const { out } = run([s]);
		expect(out).toEqual([
			{ kind: "html", placement: "body:end", html: "<script>x()</script>", key: `hfc-${s.id}` },
		]);
	});

	it("keeps priority order within a placement", () => {
		const late = makeSnippet({ priority: 50, code: "late" });
		const early = makeSnippet({ priority: 1, code: "early" });
		const { out } = run([late, early]);
		expect(out.map((f) => (f.kind === "html" ? f.html : ""))).toEqual(["early", "late"]);
	});

	it("skips non-matching snippets", () => {
		const { out } = run([makeSnippet({ includePaths: ["/blog/*"] })], [], makePage({ path: "/about" }));
		expect(out).toEqual([]);
	});

	it("applies a rewriting transform", () => {
		const t: Transform = ({ html }) => html.replace("a", "b");
		const { out } = run([makeSnippet({ code: "a" })], [t]);
		expect(out[0]).toMatchObject({ html: "b" });
	});

	it("chains transforms in order and passes snippet and page", () => {
		const seen: string[] = [];
		const t1: Transform = ({ html, snippet, page }) => {
			seen.push(`${snippet.name}@${page.path}`);
			return `${html}1`;
		};
		const t2: Transform = ({ html }) => `${html}2`;
		const s = makeSnippet({ code: "x", name: "N" });
		const { out } = run([s], [t1, t2], makePage({ path: "/p" }));
		expect(out[0]).toMatchObject({ html: "x12" });
		expect(seen).toEqual(["N@/p"]);
	});

	it("a transform returning null skips only that snippet", () => {
		const skip = makeSnippet({ code: "skip" });
		const keep = makeSnippet({ code: "keep" });
		const t: Transform = ({ html }) => (html === "skip" ? null : html);
		const { out } = run([skip, keep], [t]);
		expect(out.map((f) => (f.kind === "html" ? f.html : ""))).toEqual(["keep"]);
	});

	it("a throwing transform is logged; that snippet is skipped, others render", () => {
		const bad = makeSnippet({ code: "bad" });
		const good = makeSnippet({ code: "good" });
		const t: Transform = ({ html }) => {
			if (html === "bad") throw new Error("boom");
			return html;
		};
		const { out, log } = run([bad, good], [t]);
		expect(out.map((f) => (f.kind === "html" ? f.html : ""))).toEqual(["good"]);
		expect(log.errors).toHaveLength(1);
		expect(JSON.stringify(log.errors[0])).toContain(bad.id);
		expect(JSON.stringify(log.errors[0])).toContain("boom");
	});

	it("object results: html plus extra fragments, deduped by key", () => {
		const loader = { kind: "external-script" as const, placement: "head" as const, src: "/l.js", key: "loader" };
		const t: Transform = ({ html }) => ({ html, fragments: [loader] });
		const a = makeSnippet({ code: "a" });
		const b = makeSnippet({ code: "b" });
		const { out } = run([a, b], [t]);
		expect(out).toEqual([
			{ kind: "html", placement: "head", html: "a", key: `hfc-${a.id}` },
			{ kind: "html", placement: "head", html: "b", key: `hfc-${b.id}` },
			loader,
		]);
	});

	it("object result with html null skips the snippet but keeps its fragments", () => {
		const extra = { kind: "html" as const, placement: "body:end" as const, html: "<i></i>", key: "x" };
		const t: Transform = () => ({ html: null, fragments: [extra] });
		const { out } = run([makeSnippet()], [t]);
		expect(out).toEqual([extra]);
	});

	it("keyless extra fragments are all kept", () => {
		const f = { kind: "html" as const, placement: "head" as const, html: "<b></b>" };
		const t: Transform = ({ html }) => ({ html, fragments: [f] });
		const { out } = run([makeSnippet(), makeSnippet()], [t]);
		expect(out.filter((x) => x === f)).toHaveLength(2);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/pipeline.test.ts`
Expected: FAIL. Cannot find module `../src/core/pipeline.js`.

- [ ] **Step 3: Implement `src/core/pipeline.ts`**

```ts
import type { PageFragmentContribution } from "emdash";
import { type CompiledSnippet, matchesPage } from "./match.js";
import type { Logger, PageInfo, Transform } from "./types.js";

/** match → (already sorted) → transform → emit */
export function renderFragments(
	compiled: CompiledSnippet[],
	page: PageInfo,
	transforms: readonly Transform[],
	log: Logger,
): PageFragmentContribution[] {
	const snippetFragments: PageFragmentContribution[] = [];
	const extraFragments: PageFragmentContribution[] = [];
	const seenExtraKeys = new Set<string>();

	for (const c of compiled) {
		if (!matchesPage(c, page)) continue;
		const { snippet } = c;
		let html: string | null = snippet.code;

		for (let i = 0; i < transforms.length && html !== null; i++) {
			const transform = transforms[i]!;
			try {
				const result = transform({ snippet, html, page });
				if (result === null || typeof result === "string") {
					html = result;
				} else {
					html = result.html;
					for (const fragment of result.fragments ?? []) {
						if (fragment.key !== undefined) {
							if (seenExtraKeys.has(fragment.key)) continue;
							seenExtraKeys.add(fragment.key);
						}
						extraFragments.push(fragment);
					}
				}
			} catch (error) {
				log.error("Snippet transform failed; skipping snippet", {
					snippetId: snippet.id,
					transformIndex: i,
					error: error instanceof Error ? error.message : String(error),
				});
				html = null;
			}
		}

		if (html !== null) {
			snippetFragments.push({ kind: "html", placement: snippet.placement, html, key: `hfc-${snippet.id}` });
		}
	}

	return [...snippetFragments, ...extraFragments];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run test/pipeline.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: render pipeline with injectable transforms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Validation, limits and admin field definitions

**Files:**
- Create: `src/core/validate.ts`, `src/core/fields.ts`
- Test: `test/validate.test.ts`, `test/fields.test.ts`

**Interfaces:**
- Consumes: `EditableSnippet`, `Snippet`, `PLACEMENTS`, `PAGE_KINDS` (Task 1); `validatePattern` (Task 1).
- Produces:
  - `LIMITS = { maxSnippetBytes: 65536, maxTotalBytes: 524288, maxSnippets: 100, maxNameLength: 200 }`
  - `byteLength(s: string): number`
  - `formatKB(bytes: number): string` (for example `"70.2 KB"`)
  - `type ValidationResult = { ok: true; value: SnippetInput } | { ok: false; errors: Record<string, string> }`, where `type SnippetInput = Omit<EditableSnippet, "meta"> & { meta?: Record<string, unknown> }`. `meta` stays `undefined` when absent, so updates can keep the existing meta.
  - `validateSnippetInput(input: unknown): ValidationResult`: validates fields and applies defaults
  - `checkLimits(candidate: { id?: string; code: string }, existing: Snippet[]): Record<string, string> | null`
  - From `fields.ts`:
    - `type FieldType = "text" | "code" | "select" | "toggle" | "number" | "pathList" | "localeList"`
    - `interface FieldDef { name: string; label: string; type: FieldType; options?: { value: string; label: string }[]; help?: string; required?: boolean; manageOnly?: boolean }`
    - `FIELDS: readonly FieldDef[]`
    - `getFieldValue(draft: Record<string, unknown>, name: string): unknown`
    - `setFieldValue<T extends Record<string, unknown>>(draft: T, name: string, value: unknown): T`: immutable; dotted names such as `meta.x` write into the nested object
    - `emptyDraft(): EditableSnippet`

- [ ] **Step 1: Write the failing validation tests (`test/validate.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { LIMITS, byteLength, checkLimits, formatKB, validateSnippetInput } from "../src/core/validate.js";
import { makeSnippet } from "./fakes.js";

describe("validateSnippetInput", () => {
	it("applies defaults", () => {
		const r = validateSnippetInput({ name: "GA", code: "<script></script>" });
		expect(r).toEqual({
			ok: true,
			value: {
				name: "GA",
				code: "<script></script>",
				placement: "head",
				enabled: true,
				priority: 10,
				includePaths: [],
				excludePaths: [],
				pageKind: "all",
				locales: [],
				meta: undefined,
			},
		});
	});
	it("requires name and code", () => {
		const r = validateSnippetInput({ name: "  ", code: "" });
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors.name).toBe("Name is required");
			expect(r.errors.code).toBe("Code is required");
		}
	});
	it("rejects bad enums, non-integer priority, bad paths, bad locales, non-object meta", () => {
		const r = validateSnippetInput({
			name: "x",
			code: "y",
			placement: "footer",
			pageKind: "post",
			priority: 1.5,
			includePaths: ["blog"],
			excludePaths: ["/a*b"],
			locales: [""],
			meta: [],
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.errors).toEqual({
				placement: "Placement must be one of head, body:start, body:end",
				pageKind: "Page kind must be one of all, content, custom",
				priority: "Priority must be a whole number",
				includePaths: "blog: Path must start with /",
				excludePaths: "/a*b: * is only allowed at the end of a path",
				locales: "Locales must be non-empty strings",
				meta: "Meta must be an object",
			});
		}
	});
	it("rejects names longer than 200 characters", () => {
		const r = validateSnippetInput({ name: "n".repeat(201), code: "c" });
		expect(r.ok === false && r.errors.name).toBe("Name must be at most 200 characters");
	});
	it("passes meta through untouched", () => {
		const meta = { consentCategory: "analytics", nested: { a: [1, 2, { b: null }] } };
		const r = validateSnippetInput({ name: "x", code: "y", meta });
		expect(r.ok && r.value.meta).toEqual(meta);
	});
	it("rejects non-object input", () => {
		expect(validateSnippetInput(null).ok).toBe(false);
	});
});

describe("byteLength / formatKB", () => {
	it("counts UTF-8 bytes", () => {
		expect(byteLength("é")).toBe(2);
		expect(formatKB(71_885)).toBe("70.2 KB");
	});
});

describe("checkLimits", () => {
	it("rejects a snippet over 64 KB", () => {
		const errors = checkLimits({ code: "x".repeat(71_885) }, []);
		expect(errors).toEqual({ code: "Code is 70.2 KB; the limit is 64 KB per snippet" });
	});
	it("accepts exactly 64 KB", () => {
		expect(checkLimits({ code: "x".repeat(LIMITS.maxSnippetBytes) }, [])).toBeNull();
	});
	it("rejects when the total would exceed 512 KB, counting the replaced snippet only once", () => {
		const big = "x".repeat(60 * 1024);
		const existing = Array.from({ length: 8 }, () => makeSnippet({ code: big })); // 480 KB
		expect(checkLimits({ code: big }, existing)).toEqual({
			code: "Total code would be 540.0 KB; the limit is 512 KB across all snippets",
		});
		// Updating an existing snippet replaces its size rather than adding to it.
		expect(checkLimits({ id: existing[0]!.id, code: big }, existing)).toBeNull();
	});
	it("rejects a 101st snippet but allows updating when at 100", () => {
		const existing = Array.from({ length: 100 }, () => makeSnippet({ code: "x" }));
		expect(checkLimits({ code: "x" }, existing)).toEqual({ _form: "You can have at most 100 snippets" });
		expect(checkLimits({ id: existing[5]!.id, code: "x" }, existing)).toBeNull();
	});
});
```

- [ ] **Step 2: Write the failing field tests (`test/fields.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { FIELDS, emptyDraft, getFieldValue, setFieldValue } from "../src/core/fields.js";

describe("FIELDS", () => {
	it("covers every editable field, in form order", () => {
		expect(FIELDS.map((f) => f.name)).toEqual([
			"name",
			"code",
			"placement",
			"enabled",
			"priority",
			"includePaths",
			"excludePaths",
			"pageKind",
			"locales",
		]);
	});
	it("marks code as manage-only and required", () => {
		const code = FIELDS.find((f) => f.name === "code")!;
		expect(code).toMatchObject({ type: "code", manageOnly: true, required: true });
	});
});

describe("get/setFieldValue", () => {
	it("reads and writes top-level fields immutably", () => {
		const d = emptyDraft();
		const d2 = setFieldValue(d, "name", "GA");
		expect(d.name).toBe("");
		expect(getFieldValue(d2, "name")).toBe("GA");
	});
	it("reads and writes dotted meta fields, preserving other meta keys", () => {
		const d = { ...emptyDraft(), meta: { keep: 1 } };
		const d2 = setFieldValue(d, "meta.consentCategory", "analytics");
		expect(d2.meta).toEqual({ keep: 1, consentCategory: "analytics" });
		expect(getFieldValue(d2, "meta.consentCategory")).toBe("analytics");
		expect(d.meta).toEqual({ keep: 1 });
	});
	it("returns undefined for missing nested paths", () => {
		expect(getFieldValue(emptyDraft(), "meta.nope")).toBeUndefined();
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run test/validate.test.ts test/fields.test.ts`
Expected: FAIL. Modules not found.

- [ ] **Step 4: Implement `src/core/validate.ts`**

```ts
import { validatePattern } from "./paths.js";
import { type EditableSnippet, PAGE_KINDS, PLACEMENTS, type Snippet } from "./types.js";

export const LIMITS = {
	maxSnippetBytes: 64 * 1024,
	maxTotalBytes: 512 * 1024,
	maxSnippets: 100,
	maxNameLength: 200,
} as const;

export type SnippetInput = Omit<EditableSnippet, "meta"> & { meta?: Record<string, unknown> };
export type ValidationResult =
	| { ok: true; value: SnippetInput }
	| { ok: false; errors: Record<string, string> };

const encoder = new TextEncoder();
export function byteLength(s: string): number {
	return encoder.encode(s).length;
}
export function formatKB(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} KB`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringList(v: unknown): string[] | null {
	if (v === undefined) return [];
	if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return null;
	return v.map((x) => x.trim()).filter((x) => x !== "");
}

function pathListError(list: string[]): string | null {
	for (const p of list) {
		const err = validatePattern(p);
		if (err) return `${p}: ${err}`;
	}
	return null;
}

export function validateSnippetInput(input: unknown): ValidationResult {
	if (!isPlainObject(input)) return { ok: false, errors: { _form: "Invalid request body" } };
	const errors: Record<string, string> = {};

	const name = typeof input.name === "string" ? input.name.trim() : "";
	if (!name) errors.name = "Name is required";
	else if (name.length > LIMITS.maxNameLength) errors.name = "Name must be at most 200 characters";

	const code = typeof input.code === "string" ? input.code : "";
	if (code.trim() === "") errors.code = "Code is required";

	const placement = input.placement ?? "head";
	if (!PLACEMENTS.includes(placement as never)) {
		errors.placement = `Placement must be one of ${PLACEMENTS.join(", ")}`;
	}

	const pageKind = input.pageKind ?? "all";
	if (!PAGE_KINDS.includes(pageKind as never)) {
		errors.pageKind = `Page kind must be one of ${PAGE_KINDS.join(", ")}`;
	}

	const enabled = input.enabled ?? true;
	if (typeof enabled !== "boolean") errors.enabled = "Enabled must be true or false";

	const priority = input.priority ?? 10;
	if (typeof priority !== "number" || !Number.isInteger(priority)) {
		errors.priority = "Priority must be a whole number";
	}

	const includePaths = stringList(input.includePaths);
	if (includePaths === null) errors.includePaths = "Include paths must be a list of paths";
	else {
		const err = pathListError(includePaths);
		if (err) errors.includePaths = err;
	}

	const excludePaths = stringList(input.excludePaths);
	if (excludePaths === null) errors.excludePaths = "Exclude paths must be a list of paths";
	else {
		const err = pathListError(excludePaths);
		if (err) errors.excludePaths = err;
	}

	let locales: string[] = [];
	if (input.locales !== undefined) {
		if (!Array.isArray(input.locales) || !input.locales.every((l) => typeof l === "string" && l.trim() !== "")) {
			errors.locales = "Locales must be non-empty strings";
		} else {
			locales = input.locales.map((l: string) => l.trim());
		}
	}

	let meta: Record<string, unknown> | undefined;
	if (input.meta !== undefined) {
		if (!isPlainObject(input.meta)) errors.meta = "Meta must be an object";
		else meta = input.meta;
	}

	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return {
		ok: true,
		value: {
			name,
			code,
			placement: placement as SnippetInput["placement"],
			enabled: enabled as boolean,
			priority: priority as number,
			includePaths: includePaths!,
			excludePaths: excludePaths!,
			pageKind: pageKind as SnippetInput["pageKind"],
			locales,
			meta,
		},
	};
}

/** Size and count limits. `candidate.id` set = update of an existing snippet. */
export function checkLimits(
	candidate: { id?: string; code: string },
	existing: Snippet[],
): Record<string, string> | null {
	const isUpdate = candidate.id !== undefined && existing.some((s) => s.id === candidate.id);
	if (!isUpdate && existing.length >= LIMITS.maxSnippets) {
		return { _form: `You can have at most ${LIMITS.maxSnippets} snippets` };
	}
	const size = byteLength(candidate.code);
	if (size > LIMITS.maxSnippetBytes) {
		return { code: `Code is ${formatKB(size)}; the limit is 64 KB per snippet` };
	}
	const others = existing
		.filter((s) => s.id !== candidate.id)
		.reduce((sum, s) => sum + byteLength(s.code), 0);
	const total = others + size;
	if (total > LIMITS.maxTotalBytes) {
		return { code: `Total code would be ${formatKB(total)}; the limit is 512 KB across all snippets` };
	}
	return null;
}
```

- [ ] **Step 5: Implement `src/core/fields.ts`**

```ts
import type { EditableSnippet } from "./types.js";

export type FieldType = "text" | "code" | "select" | "toggle" | "number" | "pathList" | "localeList";

export interface FieldDef {
	/** Top-level snippet key, or a dotted path into meta such as "meta.consentCategory". */
	name: string;
	label: string;
	type: FieldType;
	options?: { value: string; label: string }[];
	help?: string;
	required?: boolean;
	/** Hidden from viewers with only plugins:read. */
	manageOnly?: boolean;
}

/** Add a field here (for example meta.consentCategory) to add it to the edit form. */
export const FIELDS: readonly FieldDef[] = [
	{ name: "name", label: "Name", type: "text", required: true, help: "Shown in the admin list only." },
	{
		name: "code",
		label: "Code",
		type: "code",
		required: true,
		manageOnly: true,
		help: "Raw HTML: <script>, <style>, <noscript>, <meta>, … Output exactly as written. Max 64 KB.",
	},
	{
		name: "placement",
		label: "Placement",
		type: "select",
		options: [
			{ value: "head", label: "Head" },
			{ value: "body:start", label: "Body start" },
			{ value: "body:end", label: "Body end" },
		],
	},
	{ name: "enabled", label: "Enabled", type: "toggle" },
	{ name: "priority", label: "Priority", type: "number", help: "Lower runs first within the same placement." },
	{
		name: "includePaths",
		label: "Include paths",
		type: "pathList",
		help: "One per line, e.g. / or /blog/*. Leave empty for every page.",
	},
	{ name: "excludePaths", label: "Exclude paths", type: "pathList", help: "One per line. Wins over include." },
	{
		name: "pageKind",
		label: "Page kind",
		type: "select",
		options: [
			{ value: "all", label: "All pages" },
			{ value: "content", label: "Content pages" },
			{ value: "custom", label: "Custom pages" },
		],
	},
	{ name: "locales", label: "Locales", type: "localeList", help: "One per line, e.g. en. Leave empty for all." },
];

export function getFieldValue(draft: Record<string, unknown>, name: string): unknown {
	let cur: unknown = draft;
	for (const part of name.split(".")) {
		if (typeof cur !== "object" || cur === null) return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

export function setFieldValue<T extends Record<string, unknown>>(draft: T, name: string, value: unknown): T {
	const [head, ...rest] = name.split(".");
	if (rest.length === 0) return { ...draft, [head!]: value };
	const child = draft[head!];
	const base = typeof child === "object" && child !== null ? (child as Record<string, unknown>) : {};
	return { ...draft, [head!]: setFieldValue(base, rest.join("."), value) };
}

export function emptyDraft(): EditableSnippet {
	return {
		name: "",
		code: "",
		placement: "head",
		enabled: true,
		priority: 10,
		includePaths: [],
		excludePaths: [],
		pageKind: "all",
		locales: [],
		meta: {},
	};
}
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run test/validate.test.ts test/fields.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: snippet validation, size limits and field definitions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: State, storage helpers and the per-isolate cache

**Files:**
- Create: `src/state.ts`, `src/repo.ts`, `src/cache.ts`
- Modify: `test/fakes.ts` (append in-memory storage and kv)
- Test: `test/cache.test.ts`, `test/state.test.ts`

**Interfaces:**
- Consumes: `PluginState`, `DEFAULT_STATE`, `Snippet`, `ChangeLogEntry`, `UserRef`, `Logger` (Task 1); `prepareSnippets`, `CompiledSnippet` (Task 2); `LIMITS` (Task 4). From `emdash`: types `KVAccess`, `StorageCollection`.
- Produces:
  - `src/state.ts`:
    - `STATE_KEY = "state"`
    - `readState(kv: Pick<KVAccess, "get">): Promise<PluginState>`
    - `bumpState(kv: Pick<KVAccess, "getVersioned" | "compareAndSet">, change?: { disabled?: boolean }): Promise<PluginState>`
  - `src/repo.ts`:
    - `type SnippetCollection = StorageCollection<Snippet>`
    - `type LogCollection = StorageCollection<ChangeLogEntry>`
    - `loadAllSnippets(c: Pick<SnippetCollection, "query">): Promise<Snippet[]>`
    - `userRef(user: { id: string; name: string | null; email: string } | undefined): UserRef`
    - `appendLog(c: Pick<LogCollection, "put">, entry: Omit<ChangeLogEntry, "id">, newId: () => string): Promise<ChangeLogEntry>`
    - `listLog(c: Pick<LogCollection, "query">): Promise<ChangeLogEntry[]>`
  - `src/cache.ts`:
    - `interface CacheContext { kv: Pick<KVAccess, "get">; storage: { snippets: Pick<SnippetCollection, "query"> }; log: Logger }`
    - `interface SnippetCache { load(ctx: CacheContext): Promise<{ disabled: boolean; snippets: CompiledSnippet[] }>; invalidate(): void }`
    - `createSnippetCache(opts?: { now?: () => number; stateTtlMs?: number }): SnippetCache`
  - `test/fakes.ts` additions: `memoryCollection<T>()`, `memoryKV()`, each recording call counts in `.calls`.

- [ ] **Step 1: Append the in-memory fakes to `test/fakes.ts`**

```ts
import type { KVAccess, QueryOptions, StorageCollection } from "emdash";

/** Minimal in-memory StorageCollection: get/put/delete/query (single-field orderBy), counts calls. */
export function memoryCollection<T extends object>() {
	const rows = new Map<string, T>();
	const calls = { get: 0, put: 0, delete: 0, query: 0 };
	const c = {
		rows,
		calls,
		async get(id: string) {
			calls.get++;
			return rows.get(id) ?? null;
		},
		async put(id: string, data: T) {
			calls.put++;
			rows.set(id, structuredClone(data));
		},
		async delete(id: string) {
			calls.delete++;
			return rows.delete(id);
		},
		async query(opts: QueryOptions = {}) {
			calls.query++;
			let items = [...rows.entries()].map(([id, data]) => ({ id, data: structuredClone(data) }));
			const [field, dir] = Object.entries(opts.orderBy ?? {})[0] ?? [];
			if (field) {
				items.sort((a, b) => {
					const av = String((a.data as Record<string, unknown>)[field]);
					const bv = String((b.data as Record<string, unknown>)[field]);
					return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === "desc" ? -1 : 1);
				});
			}
			const limit = Math.min(opts.limit ?? 50, 100);
			return { items: items.slice(0, limit), hasMore: items.length > limit };
		},
	};
	return c as typeof c & StorageCollection<T>;
}

/** Minimal in-memory KVAccess with versioned compare-and-set. */
export function memoryKV() {
	const store = new Map<string, { value: unknown; revision: number }>();
	const calls = { get: 0, getVersioned: 0, compareAndSet: 0, set: 0 };
	let failNextCas = 0;
	const kv = {
		store,
		calls,
		/** Make the next n compareAndSet calls report a conflict. */
		failCas(n: number) {
			failNextCas = n;
		},
		async get<T>(key: string) {
			calls.get++;
			return (store.get(key)?.value as T) ?? null;
		},
		async getVersioned<T>(key: string) {
			calls.getVersioned++;
			const e = store.get(key);
			return e ? { value: structuredClone(e.value) as T, revision: String(e.revision) } : null;
		},
		async compareAndSet(key: string, expected: string | null, value: unknown) {
			calls.compareAndSet++;
			if (failNextCas > 0) {
				failNextCas--;
				return { applied: false as const };
			}
			const e = store.get(key);
			const current = e ? String(e.revision) : null;
			if (current !== expected) return { applied: false as const };
			const revision = (e?.revision ?? 0) + 1;
			store.set(key, { value: structuredClone(value), revision });
			return { applied: true as const, revision: String(revision) };
		},
		async set(key: string, value: unknown) {
			calls.set++;
			store.set(key, { value: structuredClone(value), revision: (store.get(key)?.revision ?? 0) + 1 });
		},
	};
	return kv as typeof kv & KVAccess;
}
```

Move the new `import type` line to the top of the file, next to the existing import.

- [ ] **Step 2: Write the failing state tests (`test/state.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { bumpState, readState } from "../src/state.js";
import { memoryKV } from "./fakes.js";

describe("state", () => {
	it("defaults when missing", async () => {
		expect(await readState(memoryKV())).toEqual({ rev: 0, disabled: false });
	});
	it("bumps rev and applies changes", async () => {
		const kv = memoryKV();
		expect(await bumpState(kv)).toEqual({ rev: 1, disabled: false });
		expect(await bumpState(kv, { disabled: true })).toEqual({ rev: 2, disabled: true });
		expect(await bumpState(kv)).toEqual({ rev: 3, disabled: true });
		expect(await readState(kv)).toEqual({ rev: 3, disabled: true });
	});
	it("retries on compare-and-set conflict", async () => {
		const kv = memoryKV();
		kv.failCas(2);
		expect(await bumpState(kv)).toEqual({ rev: 1, disabled: false });
		expect(kv.calls.compareAndSet).toBe(3);
	});
	it("gives up after 5 conflicts", async () => {
		const kv = memoryKV();
		kv.failCas(5);
		await expect(bumpState(kv)).rejects.toThrow("Could not update plugin state");
	});
});
```

- [ ] **Step 3: Write the failing cache tests (`test/cache.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { createSnippetCache } from "../src/cache.js";
import { bumpState } from "../src/state.js";
import type { Snippet } from "../src/core/types.js";
import { makeLogger, makeSnippet, memoryCollection, memoryKV } from "./fakes.js";

function setup() {
	let t = 1_000_000;
	const clock = { now: () => t, advance: (ms: number) => void (t += ms) };
	const kv = memoryKV();
	const snippets = memoryCollection<Snippet>();
	const ctx = { kv, storage: { snippets }, log: makeLogger() };
	const cache = createSnippetCache({ now: clock.now, stateTtlMs: 1000 });
	return { clock, kv, snippets, ctx, cache };
}

describe("createSnippetCache", () => {
	it("loads snippets once per rev", async () => {
		const { snippets, ctx, cache, clock } = setup();
		const s = makeSnippet();
		await snippets.put(s.id, s);
		const r1 = await cache.load(ctx);
		expect(r1.snippets.map((c) => c.snippet.id)).toEqual([s.id]);
		clock.advance(5000);
		await cache.load(ctx);
		expect(snippets.calls.query).toBe(1);
	});

	it("coalesces the state read within the TTL window (3 hook calls per request = 1 kv read)", async () => {
		const { kv, ctx, cache } = setup();
		await Promise.all([cache.load(ctx), cache.load(ctx), cache.load(ctx)]);
		await cache.load(ctx);
		expect(kv.calls.get).toBe(1);
	});

	it("re-reads state after the TTL and reloads snippets when rev changes", async () => {
		const { kv, snippets, ctx, cache, clock } = setup();
		await cache.load(ctx);
		const s = makeSnippet();
		await snippets.put(s.id, s);
		await bumpState(kv); // simulates a write in another isolate
		clock.advance(999);
		expect((await cache.load(ctx)).snippets).toHaveLength(0); // still within TTL
		clock.advance(1);
		expect((await cache.load(ctx)).snippets).toHaveLength(1);
		expect(snippets.calls.query).toBe(2);
	});

	it("invalidate() forces an immediate state re-read (same-isolate writes)", async () => {
		const { kv, ctx, cache } = setup();
		await cache.load(ctx);
		await bumpState(kv, { disabled: true });
		cache.invalidate();
		expect((await cache.load(ctx)).disabled).toBe(true);
	});

	it("returns disabled without querying snippets when the kill switch is on", async () => {
		const { kv, snippets, ctx, cache } = setup();
		await bumpState(kv, { disabled: true });
		expect(await cache.load(ctx)).toEqual({ disabled: true, snippets: [] });
		expect(snippets.calls.query).toBe(0);
	});

	it("does not cache a failed state read", async () => {
		const { kv, ctx, cache } = setup();
		const original = kv.get;
		kv.get = (async () => {
			throw new Error("db down");
		}) as typeof kv.get;
		await expect(cache.load(ctx)).rejects.toThrow("db down");
		kv.get = original;
		await expect(cache.load(ctx)).resolves.toMatchObject({ disabled: false });
	});
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm vitest run test/state.test.ts test/cache.test.ts`
Expected: FAIL. Modules not found.

- [ ] **Step 5: Implement `src/state.ts`**

```ts
import type { KVAccess } from "emdash";
import { DEFAULT_STATE, type PluginState } from "./core/types.js";

export const STATE_KEY = "state";
const MAX_ATTEMPTS = 5;

export async function readState(kv: Pick<KVAccess, "get">): Promise<PluginState> {
	return (await kv.get<PluginState>(STATE_KEY)) ?? { ...DEFAULT_STATE };
}

/** Atomically bump `rev` (and optionally set `disabled`). Retries on conflict. */
export async function bumpState(
	kv: Pick<KVAccess, "getVersioned" | "compareAndSet">,
	change: { disabled?: boolean } = {},
): Promise<PluginState> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const current = await kv.getVersioned<PluginState>(STATE_KEY);
		const base = current?.value ?? DEFAULT_STATE;
		const next: PluginState = { ...base, ...change, rev: base.rev + 1 };
		const result = await kv.compareAndSet(STATE_KEY, current?.revision ?? null, next);
		if (result.applied) return next;
	}
	throw new Error(`Could not update plugin state after ${MAX_ATTEMPTS} attempts`);
}
```

- [ ] **Step 6: Implement `src/repo.ts`**

```ts
import type { StorageCollection } from "emdash";
import type { ChangeLogEntry, Snippet, UserRef } from "./core/types.js";
import { LIMITS } from "./core/validate.js";

export type SnippetCollection = StorageCollection<Snippet>;
export type LogCollection = StorageCollection<ChangeLogEntry>;

/** All snippets in one query. The 100-snippet cap keeps this to a single page. */
export async function loadAllSnippets(c: Pick<SnippetCollection, "query">): Promise<Snippet[]> {
	const { items } = await c.query({ orderBy: { createdAt: "asc" }, limit: LIMITS.maxSnippets });
	return items.map((i) => i.data);
}

export function userRef(user: { id: string; name: string | null; email: string } | undefined): UserRef {
	return user ? { id: user.id, name: user.name, email: user.email } : { id: "unknown", name: null, email: null };
}

export async function appendLog(
	c: Pick<LogCollection, "put">,
	entry: Omit<ChangeLogEntry, "id">,
	newId: () => string,
): Promise<ChangeLogEntry> {
	const full: ChangeLogEntry = { id: newId(), ...entry };
	await c.put(full.id, full);
	return full;
}

export async function listLog(c: Pick<LogCollection, "query">): Promise<ChangeLogEntry[]> {
	const { items } = await c.query({ orderBy: { at: "desc" }, limit: 100 });
	return items.map((i) => i.data);
}
```

- [ ] **Step 7: Implement `src/cache.ts`**

```ts
import type { KVAccess } from "emdash";
import { type CompiledSnippet, prepareSnippets } from "./core/match.js";
import type { Logger, PluginState } from "./core/types.js";
import { loadAllSnippets, type SnippetCollection } from "./repo.js";
import { readState } from "./state.js";

export interface CacheContext {
	kv: Pick<KVAccess, "get">;
	storage: { snippets: Pick<SnippetCollection, "query"> };
	log: Logger;
}

export interface SnippetCache {
	load(ctx: CacheContext): Promise<{ disabled: boolean; snippets: CompiledSnippet[] }>;
	/** Drop the coalesced state so the next load re-reads it (call after writes). */
	invalidate(): void;
}

/**
 * Per-isolate cache. The kv `state` read is shared for `stateTtlMs`. This covers
 * the up-to-3 page:fragments calls per request and bursts of concurrent requests.
 * The compiled snippet list is rebuilt only when `state.rev` changes.
 */
export function createSnippetCache(opts: { now?: () => number; stateTtlMs?: number } = {}): SnippetCache {
	const now = opts.now ?? Date.now;
	const ttl = opts.stateTtlMs ?? 1000;
	let statePromise: Promise<PluginState> | null = null;
	let stateReadAt = 0;
	let cachedRev: number | null = null;
	let compiled: CompiledSnippet[] = [];

	function getState(ctx: CacheContext): Promise<PluginState> {
		const t = now();
		if (!statePromise || t - stateReadAt >= ttl) {
			stateReadAt = t;
			const p = readState(ctx.kv);
			statePromise = p;
			p.catch(() => {
				if (statePromise === p) statePromise = null;
			});
		}
		return statePromise;
	}

	return {
		async load(ctx) {
			const state = await getState(ctx);
			if (state.disabled) return { disabled: true, snippets: [] };
			if (cachedRev !== state.rev) {
				const list = await loadAllSnippets(ctx.storage.snippets);
				compiled = prepareSnippets(list, ctx.log);
				cachedRev = state.rev;
			}
			return { disabled: false, snippets: compiled };
		},
		invalidate() {
			statePromise = null;
		},
	};
}
```

- [ ] **Step 8: Run to verify pass**

Run: `pnpm vitest run test/state.test.ts test/cache.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: kv state versioning and per-isolate snippet cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hook, plugin definition and descriptor

**Files:**
- Create: `src/hook.ts`, `src/plugin.ts`, `src/index.ts`, `src/routes.ts` (stub only: `export function createRoutes() { return {}; }`; Task 7 replaces it)
- Test: `test/hook.test.ts`, `test/plugin.test.ts`

**Interfaces:**
- Consumes: `SnippetCache`, `CacheContext` (Task 5); `renderFragments` (Task 3); `isAdminPath` (Task 2); `Transform` (Task 1); `PLUGIN_ID`, `PLUGIN_VERSION` (Task 1).
- Produces:
  - `src/hook.ts`: `createFragmentsHandler(cache: SnippetCache, transforms: readonly Transform[]): (event: { page: PageInfo }, ctx: CacheContext) => Promise<PageFragmentContribution[] | null>`
  - `src/plugin.ts`:
    - `interface HeaderFooterCodeRuntimeOptions { transforms?: Transform[] }`
    - `createPlugin(options?: HeaderFooterCodeRuntimeOptions): ResolvedPlugin`
    - re-exports the `Transform`, `TransformContext`, `TransformResult` types
  - `src/index.ts`:
    - `interface HeaderFooterCodeOptions { entrypoint?: string }`
    - `headerFooterCode(options?: HeaderFooterCodeOptions): PluginDescriptor`
    - re-exports the transform types
  - `src/routes.ts` (Task 7 fills it in): `createRoutes(deps: RouteDeps): Record<string, PluginRoute>`

- [ ] **Step 1: Write the failing hook tests (`test/hook.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { createSnippetCache } from "../src/cache.js";
import type { Snippet, Transform } from "../src/core/types.js";
import { createFragmentsHandler } from "../src/hook.js";
import { bumpState } from "../src/state.js";
import { makeLogger, makePage, makeSnippet, memoryCollection, memoryKV } from "./fakes.js";

async function setup(snippets: Snippet[], transforms: Transform[] = []) {
	const kv = memoryKV();
	const col = memoryCollection<Snippet>();
	for (const s of snippets) await col.put(s.id, s);
	const ctx = { kv, storage: { snippets: col }, log: makeLogger() };
	const cache = createSnippetCache();
	return { kv, col, ctx, cache, handler: createFragmentsHandler(cache, transforms) };
}

describe("page:fragments handler", () => {
	it("emits nothing on /_emdash/ paths and does not touch storage", async () => {
		const { handler, ctx, kv } = await setup([makeSnippet()]);
		expect(await handler({ page: makePage({ path: "/_emdash/admin" }) }, ctx)).toBeNull();
		expect(kv.calls.get).toBe(0);
	});

	it("emits matching snippets on public pages", async () => {
		const s = makeSnippet({ placement: "body:start" });
		const { handler, ctx } = await setup([s]);
		expect(await handler({ page: makePage({ path: "/" }) }, ctx)).toEqual([
			{ kind: "html", placement: "body:start", html: s.code, key: `hfc-${s.id}` },
		]);
	});

	it("emits nothing when the kill switch is on", async () => {
		const { handler, ctx, kv, cache } = await setup([makeSnippet()]);
		await bumpState(kv, { disabled: true });
		cache.invalidate();
		expect(await handler({ page: makePage() }, ctx)).toBeNull();
	});

	it("applies injected transforms", async () => {
		const t: Transform = ({ html }) => html.toUpperCase();
		const { handler, ctx } = await setup([makeSnippet({ code: "<b>x</b>" })], [t]);
		const out = await handler({ page: makePage() }, ctx);
		expect(out?.[0]).toMatchObject({ html: "<B>X</B>" });
	});

	it("logs and returns null on unexpected errors", async () => {
		const { handler, ctx, kv } = await setup([]);
		kv.get = (async () => {
			throw new Error("db down");
		}) as typeof kv.get;
		expect(await handler({ page: makePage() }, ctx)).toBeNull();
		expect(ctx.log.errors).toHaveLength(1);
	});

	it("handles 50 snippets in under 2 ms per call on a warm cache", async () => {
		const many = Array.from({ length: 50 }, (_, i) =>
			makeSnippet({ includePaths: [`/section-${i}/*`, "/"], excludePaths: ["/private/*"] }),
		);
		const { handler, ctx } = await setup(many);
		await handler({ page: makePage() }, ctx); // warm
		const runs = 200;
		const start = performance.now();
		for (let i = 0; i < runs; i++) await handler({ page: makePage({ path: "/" }) }, ctx);
		expect((performance.now() - start) / runs).toBeLessThan(2);
	});
});
```

- [ ] **Step 2: Write the failing plugin and descriptor tests (`test/plugin.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { headerFooterCode } from "../src/index.js";
import { createPlugin } from "../src/plugin.js";

describe("descriptor", () => {
	it("returns a native descriptor with matching id and version", () => {
		expect(headerFooterCode()).toEqual({
			id: "header-footer-code",
			version: "0.1.0",
			format: "native",
			entrypoint: "emdash-header-footer-code/plugin",
			options: {},
			adminEntry: "emdash-header-footer-code/admin",
			adminPages: [{ path: "/snippets", label: "Header & Footer Code", icon: "code" }],
		});
	});
	it("accepts an entrypoint override and strips it from options", () => {
		const d = headerFooterCode({ entrypoint: "my-wrapper/plugin" });
		expect(d.entrypoint).toBe("my-wrapper/plugin");
		expect(d.options).toEqual({});
		expect(d.adminEntry).toBe("emdash-header-footer-code/admin");
	});
	it("options are JSON-serialisable", () => {
		const d = headerFooterCode();
		expect(JSON.parse(JSON.stringify(d.options))).toEqual(d.options);
	});
});

describe("createPlugin", () => {
	const plugin = createPlugin();
	it("declares exactly the page-fragments capability", () => {
		expect(plugin.capabilities).toEqual(["hooks.page-fragments:register"]);
	});
	it("matches descriptor id/version", () => {
		expect(plugin.id).toBe("header-footer-code");
		expect(plugin.version).toBe("0.1.0");
	});
	it("registers the page:fragments hook", () => {
		expect(typeof plugin.hooks["page:fragments"]?.handler).toBe("function");
	});
	it("declares storage collections with indexes", () => {
		expect(plugin.storage).toEqual({
			snippets: { indexes: ["createdAt"] },
			changelog: { indexes: ["at"] },
		});
	});
	it("declares the admin page", () => {
		expect(plugin.admin.entry).toBe("emdash-header-footer-code/admin");
		expect(plugin.admin.pages).toEqual([{ path: "/snippets", label: "Header & Footer Code", icon: "code" }]);
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run test/hook.test.ts test/plugin.test.ts`
Expected: FAIL. Modules not found.

- [ ] **Step 4: Implement `src/hook.ts`**

```ts
import type { PageFragmentContribution } from "emdash";
import type { CacheContext, SnippetCache } from "./cache.js";
import { isAdminPath } from "./core/match.js";
import { renderFragments } from "./core/pipeline.js";
import type { PageInfo, Transform } from "./core/types.js";

export function createFragmentsHandler(cache: SnippetCache, transforms: readonly Transform[]) {
	return async function handlePageFragments(
		event: { page: PageInfo },
		ctx: CacheContext,
	): Promise<PageFragmentContribution[] | null> {
		const { page } = event;
		if (isAdminPath(page.path)) return null;
		try {
			const { disabled, snippets } = await cache.load(ctx);
			if (disabled || snippets.length === 0) return null;
			const fragments = renderFragments(snippets, page, transforms, ctx.log);
			return fragments.length > 0 ? fragments : null;
		} catch (error) {
			ctx.log.error("Header & Footer Code: failed to render snippets", {
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	};
}
```

- [ ] **Step 5: Implement the `src/routes.ts` stub, `src/plugin.ts` and `src/index.ts`**

`src/routes.ts` (temporary; Task 7 replaces it):
```ts
export function createRoutes(_deps: unknown) {
	return {};
}
```

`src/plugin.ts`:
```ts
import type { ResolvedPlugin } from "emdash";
import { definePlugin } from "emdash";
import { createSnippetCache } from "./cache.js";
import type { Transform } from "./core/types.js";
import { createFragmentsHandler } from "./hook.js";
import { createRoutes } from "./routes.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "./version.js";

export type { Transform, TransformContext, TransformResult, Snippet } from "./core/types.js";

export interface HeaderFooterCodeRuntimeOptions {
	/** Appended after the built-in transforms (none in v0.1). Pass via a wrapper entrypoint — see README. */
	transforms?: Transform[];
}

const BUILTIN_TRANSFORMS: readonly Transform[] = [];

export const ADMIN_ENTRY = "emdash-header-footer-code/admin";
export const ADMIN_PAGES = [{ path: "/snippets", label: "Header & Footer Code", icon: "code" }];

export function createPlugin(options: HeaderFooterCodeRuntimeOptions = {}): ResolvedPlugin {
	const transforms = [...BUILTIN_TRANSFORMS, ...(options.transforms ?? [])];
	const cache = createSnippetCache();

	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: ["hooks.page-fragments:register"],
		storage: {
			snippets: { indexes: ["createdAt"] },
			changelog: { indexes: ["at"] },
		},
		admin: { entry: ADMIN_ENTRY, pages: ADMIN_PAGES },
		hooks: {
			"page:fragments": {
				handler: createFragmentsHandler(cache, transforms),
			},
		},
		routes: createRoutes({ cache, now: () => new Date().toISOString(), newId: () => crypto.randomUUID() }),
	});
}
```

If TypeScript rejects the handler's `ctx` parameter type (EmDash passes a full `PluginContext`, which is structurally a superset of `CacheContext`), wrap it: `handler: (event, ctx) => fragments(event, ctx as unknown as CacheContext)`, where `const fragments = createFragmentsHandler(cache, transforms)`. The cast is needed because `ctx.storage.snippets` is typed `StorageCollection<unknown>`.

`src/index.ts`:
```ts
import type { PluginDescriptor } from "emdash";
import { PLUGIN_ID, PLUGIN_VERSION } from "./version.js";

export type { Transform, TransformContext, TransformResult, Snippet } from "./core/types.js";

export interface HeaderFooterCodeOptions {
	/**
	 * Module that exports `createPlugin`. Override this to point at a wrapper
	 * that injects transforms (functions cannot travel through descriptor options).
	 */
	entrypoint?: string;
}

export function headerFooterCode(options: HeaderFooterCodeOptions = {}): PluginDescriptor {
	const { entrypoint = "emdash-header-footer-code/plugin", ...rest } = options;
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint,
		options: rest,
		adminEntry: "emdash-header-footer-code/admin",
		adminPages: [{ path: "/snippets", label: "Header & Footer Code", icon: "code" }],
	};
}
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected: all tests PASS. `dist/index.mjs` and `dist/plugin.mjs` exist. Check that `dist/index.mjs` does not import `definePlugin`, which would mean runtime code had leaked into the descriptor: `grep -c definePlugin dist/index.mjs` prints `0`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: page:fragments hook, plugin definition and descriptor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Admin API routes and change log

**Files:**
- Modify: `src/routes.ts` (replace the stub)
- Test: `test/routes.test.ts`

**Interfaces:**
- Consumes: `validateSnippetInput`, `checkLimits` (Task 4); `loadAllSnippets`, `appendLog`, `listLog`, `userRef`, `SnippetCollection`, `LogCollection` (Task 5); `bumpState`, `readState` (Task 5); `SnippetCache` (Task 5). From `emdash`: `PluginRouteError`, types `PluginRoute`, `RouteContext`.
- Produces:
  - `interface RouteDeps { cache: Pick<SnippetCache, "invalidate">; now: () => string; newId: () => string }`
  - `createRoutes(deps: RouteDeps): Record<RouteName, PluginRoute>`
  - Route names and response payloads (the EmDash envelope `{ success, data }` wraps these; the admin unwraps them with `parseApiResponse`):
    - `snippets/list` → `{ disabled: boolean; canManage: boolean; snippets: SnippetSummary[] }`, where `SnippetSummary = Omit<Snippet, "code"> & { code?: string }`
    - `snippets/get` `{ id }` → `{ snippet: Snippet }`
    - `snippets/save` `{ id?, ...fields }` → `{ snippet: Snippet }`
    - `snippets/toggle` `{ id, enabled }` → `{ snippet: Snippet }`
    - `snippets/duplicate` `{ id }` → `{ snippet: Snippet }`
    - `snippets/delete` `{ id }` → `{ deleted: true }`
    - `killswitch/set` `{ disabled }` → `{ disabled: boolean }`
    - `changelog/list` → `{ entries: ChangeLogEntry[] }`
  - Validation errors: `PluginRouteError.badRequest("Validation failed", { errors })`, which the client receives as `error.details.errors`. Not found: status 404, code `NOT_FOUND`. Newer schema: status 409, code `UNSUPPORTED_SCHEMA`.

- [ ] **Step 1: Write the failing route tests (`test/routes.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import type { ChangeLogEntry, Snippet } from "../src/core/types.js";
import { createRoutes } from "../src/routes.js";
import { readState } from "../src/state.js";
import { makeLogger, makeSnippet, memoryCollection, memoryKV } from "./fakes.js";

const ADMIN = { id: "u-admin", email: "a@x.com", name: "Ada", role: 50, createdAt: "" };
const EDITOR = { id: "u-ed", email: "e@x.com", name: "Ed", role: 40, createdAt: "" };

function setup() {
	const kv = memoryKV();
	const snippets = memoryCollection<Snippet>();
	const changelog = memoryCollection<ChangeLogEntry>();
	let invalidations = 0;
	let idSeq = 0;
	let clock = 0;
	const routes = createRoutes({
		cache: { invalidate: () => void invalidations++ },
		now: () => new Date(Date.UTC(2026, 9, 5, 0, 0, clock++)).toISOString(),
		newId: () => `id-${++idSeq}`,
	});
	const call = (name: keyof typeof routes, input: unknown = {}, user: typeof ADMIN | undefined = ADMIN) =>
		routes[name].handler({ input, user, kv, storage: { snippets, changelog }, log: makeLogger() } as never);
	return { routes, call, kv, snippets, changelog, invalidations: () => invalidations };
}

const valid = { name: "GA", code: "<script>ga()</script>", placement: "head" };

describe("route permissions", () => {
	it("only snippets/list is readable by editors; everything else needs plugins:manage", () => {
		const { routes } = setup();
		for (const [name, route] of Object.entries(routes)) {
			expect(route.permission, name).toBe(name === "snippets/list" ? "plugins:read" : "plugins:manage");
		}
		expect(Object.keys(routes).sort()).toEqual([
			"changelog/list",
			"killswitch/set",
			"snippets/delete",
			"snippets/duplicate",
			"snippets/get",
			"snippets/list",
			"snippets/save",
			"snippets/toggle",
		]);
	});
});

describe("snippets/save", () => {
	it("creates a snippet with metadata, logs it, bumps rev and invalidates the cache", async () => {
		const t = setup();
		const { snippet } = (await t.call("snippets/save", valid)) as { snippet: Snippet };
		expect(snippet).toMatchObject({
			id: "id-1",
			schemaVersion: 1,
			name: "GA",
			enabled: true,
			priority: 10,
			meta: {},
			createdBy: { id: "u-admin", name: "Ada", email: "a@x.com" },
		});
		expect(t.snippets.rows.get("id-1")).toEqual(snippet);
		expect([...t.changelog.rows.values()]).toMatchObject([
			{ action: "create", snippetId: "id-1", snippetName: "GA", user: { id: "u-admin" } },
		]);
		expect((await readState(t.kv)).rev).toBe(1);
		expect(t.invalidations()).toBe(1);
	});

	it("updates keep createdAt/createdBy, set updatedBy, and keep meta when not sent", async () => {
		const t = setup();
		const { snippet } = (await t.call("snippets/save", { ...valid, meta: { consentCategory: "analytics" } })) as {
			snippet: Snippet;
		};
		const { snippet: updated } = (await t.call("snippets/save", { ...valid, id: snippet.id, name: "GA4" })) as {
			snippet: Snippet;
		};
		expect(updated.createdAt).toBe(snippet.createdAt);
		expect(updated.updatedAt).not.toBe(snippet.updatedAt);
		expect(updated.name).toBe("GA4");
		expect(updated.meta).toEqual({ consentCategory: "analytics" });
		expect([...t.changelog.rows.values()].map((e) => e.action)).toEqual(["create", "update"]);
	});

	it("round-trips meta unchanged", async () => {
		const t = setup();
		const meta = { consentCategory: "ads", deep: { list: [1, "two", { three: null }] } };
		const { snippet } = (await t.call("snippets/save", { ...valid, meta })) as { snippet: Snippet };
		const { snippet: got } = (await t.call("snippets/get", { id: snippet.id })) as { snippet: Snippet };
		expect(got.meta).toEqual(meta);
	});

	it("rejects invalid input with field errors", async () => {
		const t = setup();
		await expect(t.call("snippets/save", { name: "", code: "" })).rejects.toMatchObject({
			status: 400,
			details: { errors: { name: "Name is required", code: "Code is required" } },
		});
		expect(t.snippets.rows.size).toBe(0);
	});

	it("rejects oversized code", async () => {
		const t = setup();
		await expect(t.call("snippets/save", { ...valid, code: "x".repeat(65_537) })).rejects.toMatchObject({
			details: { errors: { code: "Code is 64.0 KB; the limit is 64 KB per snippet" } },
		});
	});

	it("404s on unknown id", async () => {
		const t = setup();
		await expect(t.call("snippets/save", { ...valid, id: "nope" })).rejects.toMatchObject({ status: 404 });
	});

	it("refuses to overwrite a record with a newer schemaVersion", async () => {
		const t = setup();
		const future = makeSnippet({ schemaVersion: 2 });
		await t.snippets.put(future.id, future);
		await expect(t.call("snippets/save", { ...valid, id: future.id })).rejects.toMatchObject({ status: 409 });
	});
});

describe("snippets/list", () => {
	it("includes code for admins and omits it for editors", async () => {
		const t = setup();
		await t.call("snippets/save", valid);
		const admin = (await t.call("snippets/list", {}, ADMIN)) as { canManage: boolean; snippets: Snippet[] };
		expect(admin.canManage).toBe(true);
		expect(admin.snippets[0]!.code).toBe(valid.code);
		const editor = (await t.call("snippets/list", {}, EDITOR)) as { canManage: boolean; snippets: Snippet[] };
		expect(editor.canManage).toBe(false);
		expect(editor.snippets[0]).not.toHaveProperty("code");
	});
	it("reports the kill switch state", async () => {
		const t = setup();
		await t.call("killswitch/set", { disabled: true });
		expect(((await t.call("snippets/list")) as { disabled: boolean }).disabled).toBe(true);
	});
});

describe("toggle / duplicate / delete / killswitch / changelog", () => {
	it("toggle sets enabled and logs enable/disable", async () => {
		const t = setup();
		const { snippet } = (await t.call("snippets/save", valid)) as { snippet: Snippet };
		const r = (await t.call("snippets/toggle", { id: snippet.id, enabled: false })) as { snippet: Snippet };
		expect(r.snippet.enabled).toBe(false);
		await t.call("snippets/toggle", { id: snippet.id, enabled: true });
		expect([...t.changelog.rows.values()].map((e) => e.action)).toEqual(["create", "disable", "enable"]);
		await expect(t.call("snippets/toggle", { id: snippet.id, enabled: "yes" })).rejects.toMatchObject({
			status: 400,
		});
	});

	it("duplicate creates a disabled copy with meta", async () => {
		const t = setup();
		const { snippet } = (await t.call("snippets/save", { ...valid, meta: { k: 1 } })) as { snippet: Snippet };
		const { snippet: copy } = (await t.call("snippets/duplicate", { id: snippet.id })) as { snippet: Snippet };
		expect(copy).toMatchObject({ name: "GA (copy)", enabled: false, code: valid.code, meta: { k: 1 } });
		expect(copy.id).not.toBe(snippet.id);
		expect([...t.changelog.rows.values()].at(-1)).toMatchObject({ action: "duplicate", snippetId: copy.id });
	});

	it("delete removes the snippet and logs its name", async () => {
		const t = setup();
		const { snippet } = (await t.call("snippets/save", valid)) as { snippet: Snippet };
		expect(await t.call("snippets/delete", { id: snippet.id })).toEqual({ deleted: true });
		expect(t.snippets.rows.size).toBe(0);
		expect([...t.changelog.rows.values()].at(-1)).toMatchObject({ action: "delete", snippetName: "GA" });
	});

	it("killswitch/set flips disabled, bumps rev and logs", async () => {
		const t = setup();
		expect(await t.call("killswitch/set", { disabled: true })).toEqual({ disabled: true });
		expect(await readState(t.kv)).toEqual({ rev: 1, disabled: true });
		await t.call("killswitch/set", { disabled: false });
		expect([...t.changelog.rows.values()].map((e) => e.action)).toEqual(["killswitch_on", "killswitch_off"]);
	});

	it("changelog/list returns newest first", async () => {
		const t = setup();
		await t.call("snippets/save", valid);
		await t.call("killswitch/set", { disabled: true });
		const { entries } = (await t.call("changelog/list")) as { entries: ChangeLogEntry[] };
		expect(entries.map((e) => e.action)).toEqual(["killswitch_on", "create"]);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/routes.test.ts`
Expected: FAIL. The stub returns no routes.

- [ ] **Step 3: Implement `src/routes.ts`**

```ts
import type { PluginRoute, RouteContext } from "emdash";
import { PluginRouteError } from "emdash";
import type { SnippetCache } from "./cache.js";
import type { ChangeLogAction, Snippet } from "./core/types.js";
import { checkLimits, validateSnippetInput } from "./core/validate.js";
import {
	appendLog,
	listLog,
	loadAllSnippets,
	type LogCollection,
	type SnippetCollection,
	userRef,
} from "./repo.js";
import { bumpState, readState } from "./state.js";

/** Mirrors Role.ADMIN in @emdash-cms/auth (plugins:manage). */
const ROLE_ADMIN = 50;
const SCHEMA_VERSION = 1;

export interface RouteDeps {
	cache: Pick<SnippetCache, "invalidate">;
	now: () => string;
	newId: () => string;
}

type Ctx = RouteContext<unknown>;

function cols(ctx: Ctx) {
	return {
		snippets: ctx.storage.snippets as unknown as SnippetCollection,
		changelog: ctx.storage.changelog as unknown as LogCollection,
	};
}

function body(ctx: Ctx): Record<string, unknown> {
	const input = ctx.input;
	return typeof input === "object" && input !== null && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: {};
}

function requireId(ctx: Ctx): string {
	const id = body(ctx).id;
	if (typeof id !== "string" || id === "") throw PluginRouteError.badRequest("Missing snippet id");
	return id;
}

async function requireSnippet(ctx: Ctx, id: string): Promise<Snippet> {
	const snippet = await cols(ctx).snippets.get(id);
	if (!snippet) throw new PluginRouteError("NOT_FOUND", "Snippet not found", 404);
	return snippet;
}

function assertWritable(snippet: Snippet) {
	if (snippet.schemaVersion > SCHEMA_VERSION) {
		throw new PluginRouteError(
			"UNSUPPORTED_SCHEMA",
			"This snippet was saved by a newer version of the plugin. Upgrade the plugin to edit it.",
			409,
		);
	}
}

export function createRoutes(deps: RouteDeps) {
	/** Log, bump rev, invalidate. Runs after every successful write. */
	async function afterWrite(ctx: Ctx, action: ChangeLogAction, snippet: Pick<Snippet, "id" | "name"> | null, change?: { disabled?: boolean }) {
		await appendLog(
			cols(ctx).changelog,
			{
				at: deps.now(),
				user: userRef(ctx.user),
				action,
				snippetId: snippet?.id ?? null,
				snippetName: snippet?.name ?? null,
			},
			deps.newId,
		);
		const state = await bumpState(ctx.kv, change);
		deps.cache.invalidate();
		return state;
	}

	const routes = {
		"snippets/list": {
			permission: "plugins:read",
			handler: async (ctx: Ctx) => {
				const canManage = (ctx.user?.role ?? 0) >= ROLE_ADMIN;
				const [state, all] = await Promise.all([readState(ctx.kv), loadAllSnippets(cols(ctx).snippets)]);
				const snippets = canManage ? all : all.map(({ code: _code, ...rest }) => rest);
				return { disabled: state.disabled, canManage, snippets };
			},
		},

		"snippets/get": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => ({ snippet: await requireSnippet(ctx, requireId(ctx)) }),
		},

		"snippets/save": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const input = body(ctx);
				const id = typeof input.id === "string" && input.id !== "" ? input.id : undefined;
				const result = validateSnippetInput(input);
				if (!result.ok) throw PluginRouteError.badRequest("Validation failed", { errors: result.errors });

				const all = await loadAllSnippets(cols(ctx).snippets);
				const existing = id ? all.find((s) => s.id === id) : undefined;
				if (id && !existing) throw new PluginRouteError("NOT_FOUND", "Snippet not found", 404);
				if (existing) assertWritable(existing);

				const limitErrors = checkLimits({ id, code: result.value.code }, all);
				if (limitErrors) throw PluginRouteError.badRequest("Validation failed", { errors: limitErrors });

				const now = deps.now();
				const user = userRef(ctx.user);
				const { meta, ...fields } = result.value;
				const snippet: Snippet = existing
					? { ...existing, ...fields, meta: meta ?? existing.meta, updatedAt: now, updatedBy: user }
					: {
							id: deps.newId(),
							schemaVersion: SCHEMA_VERSION,
							...fields,
							meta: meta ?? {},
							createdAt: now,
							updatedAt: now,
							createdBy: user,
							updatedBy: user,
						};
				await cols(ctx).snippets.put(snippet.id, snippet);
				await afterWrite(ctx, existing ? "update" : "create", snippet);
				return { snippet };
			},
		},

		"snippets/toggle": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const id = requireId(ctx);
				const enabled = body(ctx).enabled;
				if (typeof enabled !== "boolean") throw PluginRouteError.badRequest("enabled must be true or false");
				const current = await requireSnippet(ctx, id);
				assertWritable(current);
				const snippet: Snippet = { ...current, enabled, updatedAt: deps.now(), updatedBy: userRef(ctx.user) };
				await cols(ctx).snippets.put(id, snippet);
				await afterWrite(ctx, enabled ? "enable" : "disable", snippet);
				return { snippet };
			},
		},

		"snippets/duplicate": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const source = await requireSnippet(ctx, requireId(ctx));
				const all = await loadAllSnippets(cols(ctx).snippets);
				const limitErrors = checkLimits({ code: source.code }, all);
				if (limitErrors) throw PluginRouteError.badRequest("Validation failed", { errors: limitErrors });
				const now = deps.now();
				const user = userRef(ctx.user);
				const snippet: Snippet = {
					...structuredClone(source),
					id: deps.newId(),
					name: `${source.name} (copy)`.slice(0, 200),
					enabled: false,
					createdAt: now,
					updatedAt: now,
					createdBy: user,
					updatedBy: user,
				};
				await cols(ctx).snippets.put(snippet.id, snippet);
				await afterWrite(ctx, "duplicate", snippet);
				return { snippet };
			},
		},

		"snippets/delete": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const snippet = await requireSnippet(ctx, requireId(ctx));
				await cols(ctx).snippets.delete(snippet.id);
				await afterWrite(ctx, "delete", snippet);
				return { deleted: true };
			},
		},

		"killswitch/set": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const disabled = body(ctx).disabled;
				if (typeof disabled !== "boolean") throw PluginRouteError.badRequest("disabled must be true or false");
				const state = await afterWrite(ctx, disabled ? "killswitch_on" : "killswitch_off", null, { disabled });
				return { disabled: state.disabled };
			},
		},

		"changelog/list": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => ({ entries: await listLog(cols(ctx).changelog) }),
		},
	} satisfies Record<string, PluginRoute>;

	return routes;
}
```

Note: the change-log `id` comes from `newId()` (a UUID), so ordering relies on the `at` index. Two entries in the same millisecond can come back in either order; that is acceptable.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS. If `satisfies Record<string, PluginRoute>` fails because `permission` widens to `string`, add `as const` to each permission literal (`permission: "plugins:manage" as const`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: admin API routes with change log and role-aware listing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: React admin page

**Files:**
- Create: `src/admin/index.tsx`, `src/admin/api.ts`, `src/admin/SnippetsPage.tsx`, `src/admin/SnippetList.tsx`, `src/admin/SnippetForm.tsx`, `src/admin/ChangeLog.tsx`
- Test: `test/admin-api.test.ts` (request shapes). Visual behaviour is covered by the Task 9 e2e tests.

**Interfaces:**
- Consumes: route names and payloads (Task 7); `FIELDS`, `FieldDef`, `getFieldValue`, `setFieldValue`, `emptyDraft` (Task 4); `validateSnippetInput` (Task 4); types (Task 1). From `emdash/plugin-utils`: `apiFetch`, `parseApiResponse`, `getErrorMessage`. From `@cloudflare/kumo`: `Switch` (`checked`, `onCheckedChange`, `label`).
- Produces:
  - `src/admin/index.tsx`: `export const pages = { "/snippets": SnippetsPage }`
  - `src/admin/api.ts`: `api.list()`, `api.get(id)`, `api.save(draft)`, `api.toggle(id, enabled)`, `api.duplicate(id)`, `api.remove(id)`, `api.setKillSwitch(disabled)`, `api.changelog()`, and `class ApiError extends Error { fieldErrors: Record<string, string> }`

**Stable test hooks:** the e2e tests in Task 9 depend on these `data-testid` values. Use exactly:
`hfc-theme-note`, `hfc-killswitch`, `hfc-disabled-banner`, `hfc-new`, `hfc-row-<id>`, `hfc-row-toggle-<id>`, `hfc-row-edit-<id>`, `hfc-row-duplicate-<id>`, `hfc-row-delete-<id>`, `hfc-confirm-delete`, `hfc-field-<name>` (on each input, with the name as in `FIELDS`), `hfc-save`, `hfc-cancel`, `hfc-error-<name>`, `hfc-tab-snippets`, `hfc-tab-changelog`, `hfc-changelog-row`.

- [ ] **Step 1: Write the failing API client test (`test/admin-api.test.ts`)**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/admin/api.js";

const BASE = "/_emdash/api/plugins/header-footer-code";

function mockFetch(status: number, json: unknown) {
	const fn = vi.fn(async () => new Response(JSON.stringify(json), { status }));
	vi.stubGlobal("fetch", fn);
	return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("admin api client", () => {
	it("lists via GET with the CSRF header", async () => {
		const fn = mockFetch(200, { success: true, data: { disabled: false, canManage: true, snippets: [] } });
		expect(await api.list()).toEqual({ disabled: false, canManage: true, snippets: [] });
		const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(`${BASE}/snippets/list`);
		expect(new Headers(init.headers).get("X-EmDash-Request")).toBe("1");
	});
	it("saves via POST JSON", async () => {
		const fn = mockFetch(200, { success: true, data: { snippet: { id: "1" } } });
		await api.save({ name: "a", code: "b" } as never);
		const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(`${BASE}/snippets/save`);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string)).toEqual({ name: "a", code: "b" });
	});
	it("surfaces field errors from validation failures", async () => {
		mockFetch(400, {
			success: false,
			error: { code: "BAD_REQUEST", message: "Validation failed", details: { errors: { name: "Name is required" } } },
		});
		const err = await api.save({} as never).catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err.fieldErrors).toEqual({ name: "Name is required" });
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/admin-api.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement `src/admin/api.ts`**

```ts
import { apiFetch } from "emdash/plugin-utils";
import type { ChangeLogEntry, EditableSnippet, Snippet } from "../core/types.js";

const BASE = "/_emdash/api/plugins/header-footer-code";

export type SnippetSummary = Omit<Snippet, "code"> & { code?: string };
export interface ListResponse {
	disabled: boolean;
	canManage: boolean;
	snippets: SnippetSummary[];
}

export class ApiError extends Error {
	constructor(
		message: string,
		public fieldErrors: Record<string, string> = {},
	) {
		super(message);
	}
}

async function call<T>(route: string, payload?: unknown): Promise<T> {
	const init: RequestInit =
		payload === undefined
			? { method: "GET" }
			: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
	const res = await apiFetch(`${BASE}/${route}`, init);
	const json = (await res.json().catch(() => ({}))) as {
		data?: T;
		error?: { message?: string; details?: { errors?: Record<string, string> } };
	};
	if (!res.ok) {
		throw new ApiError(json.error?.message ?? `Request failed (${res.status})`, json.error?.details?.errors ?? {});
	}
	return json.data as T;
}

export const api = {
	list: () => call<ListResponse>("snippets/list"),
	get: (id: string) => call<{ snippet: Snippet }>("snippets/get", { id }),
	save: (draft: EditableSnippet & { id?: string }) => call<{ snippet: Snippet }>("snippets/save", draft),
	toggle: (id: string, enabled: boolean) => call<{ snippet: Snippet }>("snippets/toggle", { id, enabled }),
	duplicate: (id: string) => call<{ snippet: Snippet }>("snippets/duplicate", { id }),
	remove: (id: string) => call<{ deleted: true }>("snippets/delete", { id }),
	setKillSwitch: (disabled: boolean) => call<{ disabled: boolean }>("killswitch/set", { disabled }),
	changelog: () => call<{ entries: ChangeLogEntry[] }>("changelog/list"),
};
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run test/admin-api.test.ts`
Expected: PASS. If `emdash/plugin-utils` fails to load in Node, add `test: { server: { deps: { inline: ["emdash"] } } }` to `vitest.config.ts`.

- [ ] **Step 5: Implement `src/admin/SnippetForm.tsx`**

```tsx
import { Switch } from "@cloudflare/kumo";
import * as React from "react";
import { FIELDS, type FieldDef, getFieldValue, setFieldValue } from "../core/fields.js";
import type { EditableSnippet } from "../core/types.js";
import { validateSnippetInput } from "../core/validate.js";
import { ApiError, api } from "./api.js";

type Draft = EditableSnippet & { id?: string };

const inputClass = "w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm";

function FieldInput({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
	const id = `hfc-field-${field.name}`;
	switch (field.type) {
		case "text":
			return <input id={id} data-testid={id} className={inputClass} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
		case "number":
			return (
				<input
					id={id}
					data-testid={id}
					type="number"
					step={1}
					className={inputClass}
					value={String(value ?? "")}
					onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
				/>
			);
		case "code":
			return (
				<textarea
					id={id}
					data-testid={id}
					className={`${inputClass} font-mono min-h-64`}
					spellCheck={false}
					value={String(value ?? "")}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
		case "select":
			return (
				<select id={id} data-testid={id} className={inputClass} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
					{field.options?.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			);
		case "toggle":
			return <Switch data-testid={id} checked={Boolean(value)} onCheckedChange={onChange} label={field.label} />;
		case "pathList":
		case "localeList":
			return (
				<textarea
					id={id}
					data-testid={id}
					className={`${inputClass} font-mono min-h-20`}
					value={Array.isArray(value) ? value.join("\n") : ""}
					onChange={(e) => onChange(e.target.value.split("\n"))}
				/>
			);
	}
}

export function SnippetForm({ initial, onDone }: { initial: Draft; onDone: (saved: boolean) => void }) {
	const [draft, setDraft] = React.useState<Draft>(initial);
	const [errors, setErrors] = React.useState<Record<string, string>>({});
	const [saving, setSaving] = React.useState(false);

	async function save() {
		const local = validateSnippetInput(draft);
		if (!local.ok) {
			setErrors(local.errors);
			return;
		}
		setSaving(true);
		try {
			await api.save({ ...local.value, meta: draft.meta, id: draft.id });
			onDone(true);
		} catch (e) {
			setErrors(e instanceof ApiError ? { _form: e.message, ...e.fieldErrors } : { _form: String(e) });
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="space-y-4">
			<h2 className="text-lg font-semibold">{draft.id ? "Edit snippet" : "New snippet"}</h2>
			{errors._form && errors._form !== "Validation failed" && (
				<p data-testid="hfc-error-_form" className="text-kumo-danger text-sm">{errors._form}</p>
			)}
			{FIELDS.map((field) => (
				<div key={field.name} className="space-y-1">
					{field.type !== "toggle" && (
						<label htmlFor={`hfc-field-${field.name}`} className="block text-sm font-medium">
							{field.label}
							{field.required && " *"}
						</label>
					)}
					<FieldInput
						field={field}
						value={getFieldValue(draft as unknown as Record<string, unknown>, field.name)}
						onChange={(v) => setDraft((d) => setFieldValue(d as unknown as Record<string, unknown>, field.name, v) as unknown as Draft)}
					/>
					{field.help && <p className="text-xs text-kumo-subtle">{field.help}</p>}
					{errors[field.name] && (
						<p data-testid={`hfc-error-${field.name}`} className="text-kumo-danger text-sm">{errors[field.name]}</p>
					)}
				</div>
			))}
			<div className="flex gap-2">
				<button data-testid="hfc-save" type="button" disabled={saving} onClick={save} className="rounded-md bg-kumo-brand px-4 py-2 text-sm text-white">
					{saving ? "Saving…" : "Save"}
				</button>
				<button data-testid="hfc-cancel" type="button" onClick={() => onDone(false)} className="rounded-md border border-kumo-line px-4 py-2 text-sm">
					Cancel
				</button>
			</div>
		</div>
	);
}
```

The pathList and localeList textareas keep blank lines while the user is typing. `validateSnippetInput` trims entries and drops empty ones before saving.

- [ ] **Step 6: Implement `src/admin/SnippetList.tsx`**

```tsx
import { Switch } from "@cloudflare/kumo";
import * as React from "react";
import type { SnippetSummary } from "./api.js";

const PLACEMENT_LABEL = { head: "Head", "body:start": "Body start", "body:end": "Body end" } as const;

export function SnippetList(props: {
	snippets: SnippetSummary[];
	canManage: boolean;
	onToggle: (id: string, enabled: boolean) => void;
	onEdit: (id: string) => void;
	onDuplicate: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	const [confirming, setConfirming] = React.useState<SnippetSummary | null>(null);
	if (props.snippets.length === 0) {
		return <p className="text-sm text-kumo-subtle">No snippets yet.</p>;
	}
	return (
		<>
			<table className="w-full text-sm">
				<thead>
					<tr className="text-left text-kumo-subtle">
						<th className="py-2">Name</th>
						<th>Placement</th>
						<th>Enabled</th>
						<th>Priority</th>
						<th>Last updated</th>
						{props.canManage && <th />}
					</tr>
				</thead>
				<tbody>
					{props.snippets.map((s) => (
						<tr key={s.id} data-testid={`hfc-row-${s.id}`} className="border-t border-kumo-line">
							<td className="py-2">{s.name}</td>
							<td>{PLACEMENT_LABEL[s.placement]}</td>
							<td>
								{props.canManage ? (
									<Switch
										data-testid={`hfc-row-toggle-${s.id}`}
										checked={s.enabled}
										onCheckedChange={(v: boolean) => props.onToggle(s.id, v)}
										label={s.enabled ? "On" : "Off"}
									/>
								) : s.enabled ? (
									"On"
								) : (
									"Off"
								)}
							</td>
							<td>{s.priority}</td>
							<td>
								{new Date(s.updatedAt).toLocaleString()}
								{s.updatedBy.name ? ` · ${s.updatedBy.name}` : ""}
							</td>
							{props.canManage && (
								<td className="space-x-2 text-right">
									<button data-testid={`hfc-row-edit-${s.id}`} type="button" onClick={() => props.onEdit(s.id)}>Edit</button>
									<button data-testid={`hfc-row-duplicate-${s.id}`} type="button" onClick={() => props.onDuplicate(s.id)}>Duplicate</button>
									<button data-testid={`hfc-row-delete-${s.id}`} type="button" className="text-kumo-danger" onClick={() => setConfirming(s)}>Delete</button>
								</td>
							)}
						</tr>
					))}
				</tbody>
			</table>
			{confirming && (
				<div role="dialog" aria-modal="true" className="fixed inset-0 flex items-center justify-center bg-black/40">
					<div className="rounded-lg bg-kumo-base p-6 space-y-4 max-w-sm">
						<p>Delete “{confirming.name}”? This cannot be undone.</p>
						<div className="flex gap-2 justify-end">
							<button type="button" onClick={() => setConfirming(null)}>Cancel</button>
							<button
								data-testid="hfc-confirm-delete"
								type="button"
								className="text-kumo-danger"
								onClick={() => {
									props.onDelete(confirming.id);
									setConfirming(null);
								}}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
```

- [ ] **Step 7: Implement `src/admin/ChangeLog.tsx`**

```tsx
import * as React from "react";
import type { ChangeLogEntry } from "../core/types.js";
import { api } from "./api.js";

const ACTION_LABEL: Record<ChangeLogEntry["action"], string> = {
	create: "Created",
	update: "Edited",
	enable: "Enabled",
	disable: "Disabled",
	duplicate: "Duplicated",
	delete: "Deleted",
	killswitch_on: "Turned all output off",
	killswitch_off: "Turned all output on",
};

export function ChangeLog() {
	const [entries, setEntries] = React.useState<ChangeLogEntry[] | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	React.useEffect(() => {
		api.changelog().then((r) => setEntries(r.entries), (e) => setError(String(e.message ?? e)));
	}, []);
	if (error) return <p className="text-kumo-danger text-sm">{error}</p>;
	if (!entries) return <p className="text-sm">Loading…</p>;
	if (entries.length === 0) return <p className="text-sm text-kumo-subtle">No changes yet.</p>;
	return (
		<table className="w-full text-sm">
			<thead>
				<tr className="text-left text-kumo-subtle">
					<th className="py-2">When</th>
					<th>Who</th>
					<th>Action</th>
					<th>Snippet</th>
				</tr>
			</thead>
			<tbody>
				{entries.map((e) => (
					<tr key={e.id} data-testid="hfc-changelog-row" className="border-t border-kumo-line">
						<td className="py-2">{new Date(e.at).toLocaleString()}</td>
						<td>{e.user.name ?? e.user.email ?? e.user.id}</td>
						<td>{ACTION_LABEL[e.action]}</td>
						<td>{e.snippetName ?? "—"}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
```

- [ ] **Step 8: Implement `src/admin/SnippetsPage.tsx` and `src/admin/index.tsx`**

`src/admin/SnippetsPage.tsx`:
```tsx
import { Switch } from "@cloudflare/kumo";
import * as React from "react";
import { emptyDraft } from "../core/fields.js";
import type { EditableSnippet } from "../core/types.js";
import { api, type ListResponse } from "./api.js";
import { ChangeLog } from "./ChangeLog.js";
import { SnippetForm } from "./SnippetForm.js";
import { SnippetList } from "./SnippetList.js";

type View = { kind: "list" } | { kind: "edit"; draft: EditableSnippet & { id?: string } };

export function SnippetsPage() {
	const [tab, setTab] = React.useState<"snippets" | "changelog">("snippets");
	const [view, setView] = React.useState<View>({ kind: "list" });
	const [data, setData] = React.useState<ListResponse | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	const refresh = React.useCallback(() => {
		api.list().then(setData, (e) => setError(String(e.message ?? e)));
	}, []);
	React.useEffect(refresh, [refresh]);

	async function run(action: () => Promise<unknown>) {
		setError(null);
		try {
			await action();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
		refresh();
	}

	async function edit(id: string) {
		const { snippet } = await api.get(id);
		setView({ kind: "edit", draft: snippet });
	}

	async function setKillSwitch(outputEnabled: boolean) {
		if (!outputEnabled && !window.confirm("Turn off all snippet output on every page?")) return;
		await run(() => api.setKillSwitch(!outputEnabled));
	}

	return (
		<div className="space-y-6 p-6">
			<header className="space-y-3">
				<h1 className="text-2xl font-semibold">Header &amp; Footer Code</h1>
				<p data-testid="hfc-theme-note" className="rounded-md border border-kumo-line bg-kumo-tint p-3 text-sm">
					Snippets only render if your theme's layout includes <code>&lt;EmDashHead /&gt;</code>,{" "}
					<code>&lt;EmDashBodyStart /&gt;</code> and <code>&lt;EmDashBodyEnd /&gt;</code> for the matching
					placements. Pages served from an edge HTML cache show changes only after the cache is purged.
				</p>
				{data?.disabled && (
					<p data-testid="hfc-disabled-banner" className="rounded-md bg-kumo-danger p-3 text-sm font-semibold text-white">
						All snippet output is disabled.
					</p>
				)}
				{data?.canManage && (
					<Switch
						data-testid="hfc-killswitch"
						checked={!data.disabled}
						onCheckedChange={setKillSwitch}
						label="Output enabled"
					/>
				)}
				{error && <p className="text-kumo-danger text-sm">{error}</p>}
			</header>

			{view.kind === "edit" ? (
				<SnippetForm
					initial={view.draft}
					onDone={() => {
						setView({ kind: "list" });
						refresh();
					}}
				/>
			) : (
				<>
					<nav className="flex gap-4 border-b border-kumo-line">
						<button data-testid="hfc-tab-snippets" type="button" onClick={() => setTab("snippets")} aria-pressed={tab === "snippets"}>
							Snippets
						</button>
						{data?.canManage && (
							<button data-testid="hfc-tab-changelog" type="button" onClick={() => setTab("changelog")} aria-pressed={tab === "changelog"}>
								Change log
							</button>
						)}
					</nav>
					{tab === "changelog" ? (
						<ChangeLog />
					) : !data ? (
						<p className="text-sm">Loading…</p>
					) : (
						<div className="space-y-4">
							{data.canManage && (
								<button data-testid="hfc-new" type="button" onClick={() => setView({ kind: "edit", draft: emptyDraft() })} className="rounded-md bg-kumo-brand px-4 py-2 text-sm text-white">
									New snippet
								</button>
							)}
							<SnippetList
								snippets={data.snippets}
								canManage={data.canManage}
								onToggle={(id, enabled) => run(() => api.toggle(id, enabled))}
								onEdit={(id) => run(() => edit(id))}
								onDuplicate={(id) => run(() => api.duplicate(id))}
								onDelete={(id) => run(() => api.remove(id))}
							/>
						</div>
					)}
				</>
			)}
		</div>
	);
}
```

`src/admin/index.tsx`:
```tsx
import type { PluginAdminExports } from "emdash";
import { SnippetsPage } from "./SnippetsPage.js";

export const pages: PluginAdminExports["pages"] = {
	"/snippets": SnippetsPage,
};
```

If the `pages` typing rejects a component (the type says `JSX.Element`, but EmDash's reference plugins pass components), cast it: `"/snippets": SnippetsPage as unknown as JSX.Element`. `ai-moderation` passes components the same way.

- [ ] **Step 9: Typecheck and run the full suite**

Run: `pnpm typecheck && pnpm vitest run`
Expected: PASS. If the Kumo `Switch` type does not accept `data-testid`, wrap each `Switch` in `<span data-testid="…">` and target that span with Playwright's `getByRole("switch")` inside it. If you do this, update the testid usage notes in Task 9 to match.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: React admin page for snippets, kill switch and change log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end fixture and Playwright suite

**Files:**
- Create: `e2e/fixture/` (copied starter), `e2e/fixture/package.json` (rewritten), `e2e/fixture/astro.config.mjs` (modified), `e2e/test-transform/package.json`, `e2e/test-transform/plugin.ts`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/helpers.ts`, `e2e/snippets.spec.ts`, `e2e/editor.spec.ts`

**Interfaces:**
- Consumes: the built package (`pnpm build`); the admin `data-testid` values (Task 8); route names (Task 7); `headerFooterCode({ entrypoint })` (Task 6).
- Produces: `pnpm e2e` runs green locally and in CI.

- [ ] **Step 1: Copy the EmDash 1.0.1 starter into the fixture**

```bash
git clone --depth 1 --branch emdash@1.0.1 https://github.com/emdash-cms/emdash /tmp/emdash-src
mkdir -p e2e
cp -R /tmp/emdash-src/templates/starter e2e/fixture
rm -f e2e/fixture/CHANGELOG.md e2e/fixture/AGENTS.md e2e/fixture/AGENTS-template.md
grep -n "EmDashHead\|EmDashBodyStart\|EmDashBodyEnd" e2e/fixture/src/layouts/Base.astro
```
Expected: the grep prints three lines; the starter layout includes all three components.

- [ ] **Step 2: Rewrite `e2e/fixture/package.json`**

Replace the `catalog:` and `workspace:` versions with concrete ones:
```json
{
  "name": "hfc-e2e-fixture",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "emdash": { "seed": "seed/seed.json" },
  "scripts": { "dev": "astro dev --port 4399" },
  "dependencies": {
    "@astrojs/node": "^11.1.5",
    "@astrojs/react": "^6.0.5",
    "astro": "^7.3.2",
    "emdash": "1.0.1",
    "emdash-header-footer-code": "link:../..",
    "hfc-test-transform": "workspace:*",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "@cloudflare/kumo": "2.6.0"
  }
}
```

- [ ] **Step 3: Create the test-transform wrapper package (this proves spec §7.3)**

`e2e/test-transform/package.json`:
```json
{
  "name": "hfc-test-transform",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { "./plugin": "./plugin.ts" },
  "dependencies": { "emdash-header-footer-code": "link:../.." }
}
```

`e2e/test-transform/plugin.ts`:
```ts
import { createPlugin as base, type HeaderFooterCodeRuntimeOptions } from "emdash-header-footer-code/plugin";

/** Rewrites the marker HFC_TRANSFORM_ME to HFC_TRANSFORMED in every emitted snippet. */
export function createPlugin(options: HeaderFooterCodeRuntimeOptions = {}) {
	return base({
		...options,
		transforms: [({ html }) => html.replaceAll("HFC_TRANSFORM_ME", "HFC_TRANSFORMED")],
	});
}
```

- [ ] **Step 4: Register the plugin in `e2e/fixture/astro.config.mjs`**

Add the import and the `plugins` entry to the existing `emdash({...})` call:
```js
import { headerFooterCode } from "emdash-header-footer-code";
// ...
emdash({
	database: sqlite({ url: "file:./data.db" }),
	storage: local({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" }),
	plugins: [headerFooterCode({ entrypoint: "hfc-test-transform/plugin" })],
}),
```

Run: `pnpm install && pnpm build`
Expected: install links both workspace members, and the build succeeds.

- [ ] **Step 5: Write `e2e/playwright.config.ts` and `e2e/global-setup.ts`**

`e2e/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export const BASE_URL = "http://localhost:4399";

export default defineConfig({
	testDir: ".",
	testMatch: "*.spec.ts",
	workers: 1,
	fullyParallel: false,
	timeout: 60_000,
	use: { baseURL: BASE_URL, trace: "retain-on-failure" },
	globalSetup: "./global-setup.ts",
	webServer: {
		command: "rm -f data.db* && pnpm dev",
		cwd: "./fixture",
		url: `${BASE_URL}/_emdash/api/setup/status`,
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
	},
});
```

`e2e/global-setup.ts`: finishes first-run setup so later logins work.
```ts
import { BASE_URL } from "./playwright.config.js";

export default async function globalSetup() {
	const res = await fetch(`${BASE_URL}/_emdash/api/auth/dev-bypass`);
	if (!res.ok) throw new Error(`dev-bypass failed: ${res.status} ${await res.text()}`);
	// Warm the starter's homepage so Astro compiles emdash/ui components before tests.
	for (let i = 0; i < 3; i++) {
		if ((await fetch(`${BASE_URL}/`)).ok) break;
		await new Promise((r) => setTimeout(r, 1000));
	}
}
```

- [ ] **Step 6: Write `e2e/helpers.ts`**

```ts
import Database from "better-sqlite3";
import { type Page, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture", "data.db");
export const ADMIN_PAGE = "/_emdash/admin/plugins/header-footer-code/snippets";

/** Log in as the dev user (dev mode only). The user's role comes from the users table. */
export async function login(page: Page) {
	await page.goto(`/_emdash/api/auth/dev-bypass?redirect=${encodeURIComponent(ADMIN_PAGE)}`);
	await expect(page.getByTestId("hfc-theme-note")).toBeVisible();
}

/** Set the dev user's role directly (40 = Editor, 50 = Admin). */
export function setDevUserRole(role: 40 | 50) {
	const db = new Database(DB_PATH);
	db.prepare("UPDATE users SET role = ? WHERE email = ?").run(role, "dev@emdash.local");
	db.close();
}

export async function createSnippet(
	page: Page,
	s: { name: string; code: string; placement?: "head" | "body:start" | "body:end"; priority?: number; include?: string[] },
) {
	await page.getByTestId("hfc-new").click();
	await page.getByTestId("hfc-field-name").fill(s.name);
	await page.getByTestId("hfc-field-code").fill(s.code);
	if (s.placement) await page.getByTestId("hfc-field-placement").selectOption(s.placement);
	if (s.priority !== undefined) await page.getByTestId("hfc-field-priority").fill(String(s.priority));
	if (s.include) await page.getByTestId("hfc-field-includePaths").fill(s.include.join("\n"));
	await page.getByTestId("hfc-save").click();
	await expect(page.getByText(s.name, { exact: true })).toBeVisible();
}

/** Delete every snippet through the API so each test starts clean. */
export async function deleteAllSnippets(page: Page) {
	await page.evaluate(async () => {
		const base = "/_emdash/api/plugins/header-footer-code";
		const h = { "X-EmDash-Request": "1", "Content-Type": "application/json" };
		const list = await (await fetch(`${base}/snippets/list`, { headers: h })).json();
		for (const s of list.data.snippets) {
			await fetch(`${base}/snippets/delete`, { method: "POST", headers: h, body: JSON.stringify({ id: s.id }) });
		}
		await fetch(`${base}/killswitch/set`, { method: "POST", headers: h, body: JSON.stringify({ disabled: false }) });
	});
}

/** Fetch raw HTML (no JS execution) so assertions see server output exactly. */
export async function fetchHtml(page: Page, url: string): Promise<string> {
	const res = await page.request.get(url);
	expect(res.ok()).toBe(true);
	return res.text();
}
```

- [ ] **Step 7: Write `e2e/snippets.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { ADMIN_PAGE, createSnippet, deleteAllSnippets, fetchHtml, login, setDevUserRole } from "./helpers.js";

test.beforeEach(async ({ page }) => {
	setDevUserRole(50);
	await login(page);
	await deleteAllSnippets(page);
	await page.reload();
});

test("shows the theme note", async ({ page }) => {
	await expect(page.getByTestId("hfc-theme-note")).toContainText("<EmDashBodyStart />");
});

test("each placement lands in the right place, never on admin pages", async ({ page }) => {
	await createSnippet(page, { name: "Head", code: '<meta name="hfc-head" content="1">', placement: "head" });
	await createSnippet(page, { name: "Start", code: '<div id="hfc-start"></div>', placement: "body:start" });
	await createSnippet(page, { name: "End", code: '<div id="hfc-end"></div>', placement: "body:end" });

	const html = await fetchHtml(page, "/");
	const head = html.slice(html.indexOf("<head"), html.indexOf("</head>"));
	expect(head).toContain('<meta name="hfc-head" content="1">');

	const body = html.slice(html.indexOf("<body"));
	const afterBodyTag = body.slice(body.indexOf(">") + 1).trimStart();
	expect(afterBodyTag.startsWith('<div id="hfc-start"></div>')).toBe(true);
	const beforeBodyClose = body.slice(0, body.lastIndexOf("</body>")).trimEnd();
	expect(beforeBodyClose.endsWith('<div id="hfc-end"></div>')).toBe(true);

	const adminHtml = await fetchHtml(page, ADMIN_PAGE);
	expect(adminHtml).not.toContain("hfc-head");
	expect(adminHtml).not.toContain("hfc-start");
	expect(adminHtml).not.toContain("hfc-end");
});

test("priority orders snippets within a placement", async ({ page }) => {
	await createSnippet(page, { name: "Second", code: "<!--hfc-second-->", priority: 20 });
	await createSnippet(page, { name: "First", code: "<!--hfc-first-->", priority: 5 });
	const html = await fetchHtml(page, "/");
	expect(html.indexOf("<!--hfc-first-->")).toBeLessThan(html.indexOf("<!--hfc-second-->"));
});

test("include paths limit where a snippet appears", async ({ page }) => {
	await createSnippet(page, { name: "Home only", code: "<!--hfc-home-only-->", include: ["/"] });
	expect(await fetchHtml(page, "/")).toContain("<!--hfc-home-only-->");
	const other = await page.request.get("/this-page-does-not-exist");
	expect(await other.text()).not.toContain("<!--hfc-home-only-->");
});

test("disabling a snippet removes it on the next load", async ({ page }) => {
	await createSnippet(page, { name: "Toggle me", code: "<!--hfc-toggle-->" });
	expect(await fetchHtml(page, "/")).toContain("<!--hfc-toggle-->");
	const row = page.locator('[data-testid^="hfc-row-"]', { hasText: "Toggle me" });
	await row.locator('[data-testid^="hfc-row-toggle-"]').click();
	await expect(row).toContainText("Off");
	expect(await fetchHtml(page, "/")).not.toContain("<!--hfc-toggle-->");
});

test("kill switch suppresses all output", async ({ page }) => {
	await createSnippet(page, { name: "Any", code: "<!--hfc-kill-->" });
	page.once("dialog", (d) => d.accept());
	await page.getByTestId("hfc-killswitch").click();
	await expect(page.getByTestId("hfc-disabled-banner")).toBeVisible();
	expect(await fetchHtml(page, "/")).not.toContain("<!--hfc-kill-->");
});

test("transform injected via wrapper entrypoint is applied", async ({ page }) => {
	await createSnippet(page, { name: "Transform", code: "<!--HFC_TRANSFORM_ME-->" });
	const html = await fetchHtml(page, "/");
	expect(html).toContain("<!--HFC_TRANSFORMED-->");
	expect(html).not.toContain("HFC_TRANSFORM_ME");
});

test("duplicate, delete with confirmation, and the change log", async ({ page }) => {
	await createSnippet(page, { name: "Orig", code: "<!--hfc-orig-->" });
	const row = page.locator('[data-testid^="hfc-row-"]', { hasText: "Orig" }).first();
	await row.locator('[data-testid^="hfc-row-duplicate-"]').click();
	await expect(page.getByText("Orig (copy)")).toBeVisible();
	await row.locator('[data-testid^="hfc-row-delete-"]').click();
	await page.getByTestId("hfc-confirm-delete").click();
	await expect(page.getByText("Orig", { exact: true })).toHaveCount(0);
	await page.getByTestId("hfc-tab-changelog").click();
	await expect(page.getByTestId("hfc-changelog-row").first()).toContainText("Deleted");
});

test("size limit shows a clear error", async ({ page }) => {
	await page.getByTestId("hfc-new").click();
	await page.getByTestId("hfc-field-name").fill("Too big");
	await page.getByTestId("hfc-field-code").fill("x".repeat(70_000));
	await page.getByTestId("hfc-save").click();
	await expect(page.getByTestId("hfc-error-code")).toContainText("the limit is 64 KB per snippet");
});
```

- [ ] **Step 8: Write `e2e/editor.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { ADMIN_PAGE, createSnippet, deleteAllSnippets, login, setDevUserRole } from "./helpers.js";

test.afterAll(() => setDevUserRole(50));

test("an Editor sees the list read-only, without code, and cannot write", async ({ page, context }) => {
	setDevUserRole(50);
	await login(page);
	await deleteAllSnippets(page);
	await page.reload();
	await createSnippet(page, { name: "Secret", code: "<!--hfc-secret-code-->" });

	setDevUserRole(40);
	await context.clearCookies();
	await login(page);

	await expect(page.getByText("Secret", { exact: true })).toBeVisible();
	await expect(page.getByTestId("hfc-new")).toHaveCount(0);
	await expect(page.locator('[data-testid^="hfc-row-edit-"]')).toHaveCount(0);
	await expect(page.getByTestId("hfc-killswitch")).toHaveCount(0);
	await expect(page.locator("body")).not.toContainText("hfc-secret-code");

	const status = await page.evaluate(async () => {
		const res = await fetch("/_emdash/api/plugins/header-footer-code/snippets/save", {
			method: "POST",
			headers: { "X-EmDash-Request": "1", "Content-Type": "application/json" },
			body: JSON.stringify({ name: "x", code: "y" }),
		});
		return res.status;
	});
	expect(status).toBe(403);
	expect(page.url()).toContain(ADMIN_PAGE);
});
```

- [ ] **Step 9: Run the e2e suite**

Run: `pnpm e2e`
Expected: all tests PASS.

If they don't, debug in this order:
1. The admin page URL differs. Open `/_emdash/admin` in the trace, find the plugin's nav link, and update `ADMIN_PAGE`.
2. The Editor role cannot see plugin pages at all. If EmDash gates plugin pages to Admin, change the Editor test to assert the page is not reachable and that `snippets/save` returns 403. Record the change in the README's permissions section.
3. The forbidden status is 401 rather than 403. Assert `[401, 403]` contains the status.

Use the super-guild:systematic-debugging skill for anything else.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "test: Playwright e2e suite on an EmDash 1.0.1 starter fixture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README, CI, release workflow and launch checklist

**Files:**
- Create: `README.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `docs/super-guild/launch-checklist.md`

**Interfaces:**
- Consumes: everything above. The README documents the public API exactly as Tasks 6–7 built it.

- [ ] **Step 1: Write `README.md`**

It must contain these sections, in order, with this content:

1. **Title and one-line description**, plus a "native plugin — runs as first-party code" badge line.
2. **Security notice** (verbatim): "This plugin runs as first-party code with no permission sandbox. Snippet code is intentionally unsanitised HTML and is output exactly as written. Only users with the `plugins:manage` permission (Admins) can create, edit, enable or delete snippets. Never paste code you don't trust."
3. **Install:** `npm install emdash-header-footer-code`, then:
   ```js
   // astro.config.mjs
   import { headerFooterCode } from "emdash-header-footer-code";
   export default defineConfig({
     integrations: [emdash({ /* … */ plugins: [headerFooterCode()] })],
   });
   ```
   Then redeploy. Native plugins cannot be installed from the EmDash plugin registry.
4. **Capability:** the plugin declares `hooks.page-fragments:register`, the only way to add scripts or HTML to public pages. Without it, EmDash would not register the hook.
5. **Theme requirements:** the layout must render `<EmDashHead />`, `<EmDashBodyStart />` and `<EmDashBodyEnd />`. A missing component means that placement silently renders nothing. Include a short `Base.astro` example.
6. **Using it:** fields table (copy the field table from spec §5.1 with defaults); path matching rules (exact or trailing `*`, trailing slashes ignored, `/blog/*` does not match `/blog`, exclude wins); placements; priority.
7. **Kill switch:** the "Output enabled" toggle at the top of the admin page. It disables all output without deleting snippets.
8. **Permissions:** Admin can do everything; Editor can view the list but not code. Note any finding from Task 9 Step 9.
9. **Change log:** what is recorded and where to see it.
10. **Limits:** 64 KB per snippet, 512 KB total, 100 snippets.
11. **Caching and freshness:**
    - Changes reach every server instance within about 1 second.
    - Pages served from an edge HTML cache (for example Cloudflare Workers Cache) update only after a purge. Include the snippet `import { cache } from "cloudflare:workers"; await cache.purge({ purgeEverything: true })`.
    - Ordering relative to other plugins' fragments is not guaranteed.
12. **Extending with transforms:**
    - The `Transform` type signature.
    - Return-value semantics: string, `null`, or `{ html, fragments }`.
    - Errors are logged and the snippet is skipped.
    - The wrapper-entrypoint pattern, with the code from `e2e/test-transform/plugin.ts` and `headerFooterCode({ entrypoint: "your-package/plugin" })`.
    - Explain why: descriptor options are JSON-serialised, so functions cannot be passed directly.
13. **Data model notes:** `meta` is reserved for extensions (for example `meta.consentCategory`) and is stored untouched; `schemaVersion`.
14. **Versioning:** semver. Adding a capability is a major version, because native plugins have no consent prompt on upgrade.
15. **Development:** `pnpm install`, `pnpm test`, `pnpm e2e`.
16. **Licence:** MIT.

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
        env: { CI: "true" }
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: "e2e/test-results" }
```

- [ ] **Step 3: Write `.github/workflows/release.yml`**

```yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: read
  id-token: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm, registry-url: "https://registry.npmjs.org" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck && pnpm test && pnpm build
      - run: test "v$(node -p "require('./package.json').version")" = "$GITHUB_REF_NAME"
      - run: npm publish --provenance --access public
        env: { NODE_AUTH_TOKEN: "${{ secrets.NPM_TOKEN }}" }
```

- [ ] **Step 4: Verify the package contents**

Run: `pnpm build && npm pack --dry-run`
Expected: the list includes `dist/index.mjs`, `dist/plugin.mjs`, `dist/*.d.mts`, `src/admin/*.tsx`, `src/core/*.ts`, `README.md` and `LICENSE`, and no `test/` or `e2e/` files.

Then check the release version guard locally: `node -p "require('./package.json').version"` prints `0.1.0`, and `grep -n '"0.1.0"' src/version.ts` matches.

- [ ] **Step 5: Write `docs/super-guild/launch-checklist.md`**

```markdown
# v0.1 launch checklist

- [ ] CI green on main
- [ ] Manual check on a fresh `npm create emdash@latest` (1.0.1+) starter: install, add to astro.config.mjs, create a head snippet, see it on `/`, not on `/_emdash/admin`
- [ ] `NPM_TOKEN` secret set; tag `v0.1.0`; confirm the npm page shows provenance
- [ ] PR to awesome-emdash
- [ ] Post in EmDash GitHub Discussions → "Show and tell"
- [ ] Short build-log post
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: README, CI and release workflows, launch checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage map

| Spec item | Task |
|---|---|
| §2 Q1 storage collections | 5, 6 |
| §2 Q2 transform API | 1 (types), 3 |
| §2 Q3 rev + coalesced state | 5 |
| §2 Q4 theme note | 8, 10 |
| §2 Q5 package/licence | 1 |
| §4 layout and exports, no runtime code in descriptor | 1, 6 |
| §5.1 snippet record, `meta`, `schemaVersion`, newer-schema guard | 1, 7 |
| §5.2 change log | 5, 7, 8 |
| §5.3 kv state, kill switch | 5, 7, 8 |
| §5.4 limits | 4, 7, 9 |
| §6 pipeline steps 1–8, caveats, 2 ms target | 2, 3, 5, 6, 10 |
| §7 extension points (`meta`, transforms, wrapper entrypoint, `FIELDS`) | 3, 4, 6, 9 |
| §8 routes and validation | 4, 7 |
| §9 admin UI | 8 |
| §10 testing | 1–9 |
| §11 README, versioning, visibility | 10 |
| §13 acceptance criteria | 9 (e2e), 10 (manual fresh-starter check, provenance) |
