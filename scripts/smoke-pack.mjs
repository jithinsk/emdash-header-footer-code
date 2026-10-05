#!/usr/bin/env node
/**
 * Smoke test of the real install path (`pnpm smoke`).
 *
 * The e2e suite links the package (`link:../..`), so Vite treats it as source. This script
 * installs the *packed tarball* instead, the way a site would, and checks the shipped layout
 * (dist/, src/admin/*.tsx and src/core/*.ts inside node_modules) under `astro build` and the
 * production Node server:
 *
 *   pnpm build && npm pack -> copy e2e/fixture to a temp dir, depend on the tarball only
 *   -> pnpm install -> astro build -> start dist/server/entry.mjs
 *   -> run production setup (POST /_emdash/api/setup) so the seed's collections exist
 *   -> insert enabled snippets straight into SQLite (production has no dev-bypass)
 *   -> GET / and assert the head snippet is inside <head> and the body:end one before </body>
 *   -> GET the plugin admin page and assert it responds (2xx/3xx), and that a redirect lands
 *      on a 200 page; also check the compiled admin UI is in the client bundle
 *
 * Set HFC_SMOKE_KEEP=1 to keep the temp dir for debugging.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "e2e", "fixture");
const PORT = Number(process.env.HFC_SMOKE_PORT ?? 4499);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PLUGIN_ID = "header-footer-code";
const ADMIN_PAGE = `/_emdash/admin/plugins/${PLUGIN_ID}/snippets`;
const HEAD_MARKER = "<!--hfc-smoke-head-->";
const BODY_MARKER = "<!--hfc-smoke-body-end-->";
const KEEP = process.env.HFC_SMOKE_KEEP === "1";

const require = createRequire(import.meta.url);

function step(msg) {
	console.log(`\n[smoke] ${msg}`);
}

function run(cmd, args, cwd, extraEnv = {}) {
	console.log(`[smoke] $ ${cmd} ${args.join(" ")}  (cwd: ${cwd})`);
	const r = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...extraEnv } });
	if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited with ${r.status}`);
}

function assert(cond, msg) {
	if (!cond) throw new Error(`assertion failed: ${msg}`);
	console.log(`[smoke] ok: ${msg}`);
}

async function waitFor(url, server, timeoutMs = 60_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (server.exitCode !== null) throw new Error(`server exited early with ${server.exitCode}`);
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			// not up yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`timed out waiting for ${url}`);
}

function snippet(id, name, code, placement, seq) {
	const at = new Date(Date.UTC(2026, 9, 5, 0, 0, seq)).toISOString();
	const user = { id: "smoke", name: "Smoke", email: null };
	return {
		id,
		schemaVersion: 1,
		name,
		code,
		placement,
		enabled: true,
		priority: 10,
		includePaths: [],
		excludePaths: [],
		pageKind: "all",
		locales: [],
		meta: {},
		createdAt: at,
		updatedAt: at,
		createdBy: user,
		updatedBy: user,
	};
}

let tmp = null;
let server = null;
let serverLog = "";

async function main() {
	tmp = mkdtempSync(join(tmpdir(), "hfc-smoke-"));
	const site = join(tmp, "site");

	step("build and pack the package");
	run("pnpm", ["build"], ROOT);
	run("npm", ["pack", "--pack-destination", tmp], ROOT);
	const tarball = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
	assert(tarball, "npm pack produced a tarball");
	const tarballPath = join(tmp, tarball);

	step("copy the e2e fixture, depending only on the tarball");
	const SKIP = new Set(["node_modules", ".astro", "dist", "uploads", ".emdash"]);
	cpSync(FIXTURE, site, {
		recursive: true,
		filter: (src) => {
			const rel = src.slice(FIXTURE.length + 1);
			const top = rel.split(/[\\/]/)[0];
			return !SKIP.has(top) && !top.startsWith("data.db");
		},
	});

	const pkgPath = join(site, "package.json");
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
	delete pkg.dependencies["hfc-test-transform"];
	pkg.dependencies["emdash-header-footer-code"] = `file:${tarballPath}`;
	pkg.pnpm = { onlyBuiltDependencies: ["better-sqlite3", "esbuild", "sharp"] };
	writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

	const configPath = join(site, "astro.config.mjs");
	const config = readFileSync(configPath, "utf8");
	const wrapped = 'headerFooterCode({ entrypoint: "hfc-test-transform/plugin" })';
	assert(config.includes(wrapped), "fixture config uses the test-transform wrapper (to be replaced)");
	writeFileSync(configPath, config.replace(wrapped, "headerFooterCode()"));

	step("install from the tarball");
	run("pnpm", ["install", "--ignore-workspace", "--no-frozen-lockfile", "--reporter=append-only"], site);
	assert(
		existsSync(join(site, "node_modules", "emdash-header-footer-code", "src", "admin", "index.tsx")),
		"installed package ships src/admin/index.tsx",
	);
	assert(
		!existsSync(join(site, "node_modules", "emdash-header-footer-code", "test")),
		"installed package does not ship tests",
	);

	step("astro build");
	run("pnpm", ["exec", "astro", "build"], site);
	const entry = join(site, "dist", "server", "entry.mjs");
	assert(existsSync(entry), "astro build produced dist/server/entry.mjs");
	// The shipped src/admin/*.tsx is compiled into the admin client bundle.
	const clientDir = join(site, "dist", "client", "_astro");
	const adminChunk = readdirSync(clientDir).find(
		(f) => f.endsWith(".js") && readFileSync(join(clientDir, f), "utf8").includes("hfc-killswitch"),
	);
	assert(adminChunk, `the plugin admin UI is in the client bundle (${adminChunk})`);

	step("start the production server");
	server = spawn(process.execPath, [entry], {
		cwd: site,
		env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT), EMDASH_SITE_URL: ORIGIN, NODE_ENV: "production" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	server.stdout.on("data", (d) => (serverLog += d));
	server.stderr.on("data", (d) => (serverLog += d));
	// The first request runs migrations.
	await waitFor(`${ORIGIN}/_emdash/api/setup/status`, server);

	step("run production setup (applies the seed)");
	const setup = await fetch(`${ORIGIN}/_emdash/api/setup`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-EmDash-Request": "1", Origin: ORIGIN },
		body: JSON.stringify({ title: "HFC smoke", tagline: "smoke", includeContent: false }),
	});
	const setupText = await setup.text();
	assert(setup.ok, `POST /_emdash/api/setup succeeded (${setup.status} ${setupText.slice(0, 200)})`);

	step("insert enabled snippets (and finish setup) in SQLite");
	const Database = require("better-sqlite3");
	const db = new Database(join(site, "data.db"));
	// Setup normally ends with passkey admin registration, which a script cannot do. Mark it
	// complete and add an admin row so the admin route gets past the setup redirect.
	db.prepare("INSERT OR REPLACE INTO options (name, value) VALUES ('emdash:setup_complete', 'true')").run();
	db.prepare("INSERT INTO users (id, email, name, role, email_verified) VALUES ('smoke-admin', 'smoke@example.com', 'Smoke', 50, 1)").run();
	// Plugin storage table from EmDash 1.0.1 migrations 004 + 077. The kv `state` record is
	// left absent: the cache treats a missing state as rev 0 and loads on first use.
	const insert = db.prepare(
		"INSERT INTO _plugin_storage (plugin_id, collection, id, data, revision) VALUES (?, ?, ?, ?, ?)",
	);
	for (const s of [
		snippet("smoke-head", "Smoke head", HEAD_MARKER, "head", 1),
		snippet("smoke-body", "Smoke body end", BODY_MARKER, "body:end", 2),
	]) {
		insert.run(PLUGIN_ID, "snippets", s.id, JSON.stringify(s), crypto.randomUUID());
	}
	db.close();

	step("fetch / and check the snippets render");
	const home = await fetch(`${ORIGIN}/`);
	const html = await home.text();
	assert(home.status === 200, `GET / is 200 (got ${home.status})`);
	const headEnd = html.indexOf("</head>");
	const headIdx = html.indexOf(HEAD_MARKER);
	assert(headIdx !== -1 && headEnd !== -1 && headIdx < headEnd, "head snippet is inside <head>");
	const bodyIdx = html.indexOf(BODY_MARKER);
	const bodyEnd = html.lastIndexOf("</body>");
	assert(bodyIdx > headEnd && bodyIdx < bodyEnd, "body:end snippet is inside <body>, before </body>");

	step("fetch the plugin admin page");
	const admin = await fetch(`${ORIGIN}${ADMIN_PAGE}`, { redirect: "manual" });
	assert(
		admin.status >= 200 && admin.status < 400,
		`GET ${ADMIN_PAGE} responds 2xx/3xx (got ${admin.status}${admin.headers.get("location") ? ` -> ${admin.headers.get("location")}` : ""})`,
	);

	const location = admin.headers.get("location");
	if (location) {
		const next = await fetch(new URL(location, ORIGIN));
		assert(next.status === 200, `the admin redirect target serves 200 (got ${next.status})`);
	}

	console.log("\n[smoke] PASS");
}

async function cleanup() {
	if (server && server.exitCode === null) {
		server.kill("SIGTERM");
		await new Promise((r) => {
			const t = setTimeout(() => {
				server.kill("SIGKILL");
				r();
			}, 5000);
			server.once("exit", () => {
				clearTimeout(t);
				r();
			});
		});
	}
	if (tmp) {
		if (KEEP) console.log(`[smoke] kept ${tmp}`);
		else rmSync(tmp, { recursive: true, force: true });
	}
}

try {
	await main();
	await cleanup();
} catch (error) {
	console.error(`\n[smoke] FAIL: ${error instanceof Error ? error.message : error}`);
	if (serverLog) console.error(`\n[smoke] server output:\n${serverLog.slice(-8000)}`);
	await cleanup();
	process.exit(1);
}
