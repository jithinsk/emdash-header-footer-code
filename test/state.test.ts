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
