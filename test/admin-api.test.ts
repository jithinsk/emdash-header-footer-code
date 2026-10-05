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
