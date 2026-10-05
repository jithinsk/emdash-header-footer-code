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
