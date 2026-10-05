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
