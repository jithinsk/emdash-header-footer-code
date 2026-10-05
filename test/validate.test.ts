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
