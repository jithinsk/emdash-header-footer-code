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
			// EmDash 1.0.1's HTTP dispatch forwards only code + message, so the message must be readable.
			message: "Name is required; Code is required",
			details: { errors: { name: "Name is required", code: "Code is required" } },
		});
		expect(t.snippets.rows.size).toBe(0);
	});

	it("rejects oversized code", async () => {
		const t = setup();
		await expect(t.call("snippets/save", { ...valid, code: "x".repeat(65_537) })).rejects.toMatchObject({
			message: "Code is 64.0 KB; the limit is 64 KB per snippet",
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
		const admin = (await t.call("snippets/list", {}, ADMIN)) as unknown as { canManage: boolean; snippets: Snippet[] };
		expect(admin.canManage).toBe(true);
		expect(admin.snippets[0]!.code).toBe(valid.code);
		const editor = (await t.call("snippets/list", {}, EDITOR)) as unknown as { canManage: boolean; snippets: Snippet[] };
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
