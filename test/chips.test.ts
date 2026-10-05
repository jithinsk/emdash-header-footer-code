import { describe, expect, it } from "vitest";
import { addChips, validateChip } from "../src/admin/chips.js";

describe("validateChip", () => {
	it("validates paths with the core path rules", () => {
		expect(validateChip("/blog/*", "path")).toBeNull();
		expect(validateChip("blog", "path")).toBe("Path must start with /");
		expect(validateChip("/a*b", "path")).toBe("* is only allowed at the end of a path");
	});
	it("accepts any non-empty locale without whitespace", () => {
		expect(validateChip("en", "locale")).toBeNull();
		expect(validateChip("pt-BR", "locale")).toBeNull();
		expect(validateChip("en us", "locale")).toBe("Locale must not contain spaces");
	});
});

describe("addChips", () => {
	it("adds a trimmed valid value and clears the input", () => {
		expect(addChips(["/"], "  /about ", "path")).toEqual({ chips: ["/", "/about"], rest: "", error: null });
	});
	it("ignores empty input", () => {
		expect(addChips(["/"], "   ", "path")).toEqual({ chips: ["/"], rest: "", error: null });
	});
	it("does not add duplicates", () => {
		expect(addChips(["/"], "/", "path")).toEqual({ chips: ["/"], rest: "", error: null });
	});
	it("keeps an invalid value in the input with the reason, adding nothing", () => {
		expect(addChips(["/"], "blog", "path")).toEqual({
			chips: ["/"],
			rest: "blog",
			error: "Path must start with /",
		});
	});
	it("keeps only the first rejected value in the input, naming the others in the error", () => {
		const r = addChips([], "a, b", "path");
		expect(r.rest).toBe("a");
		expect(r.rest).not.toMatch(/[,\n]/);
		expect(r.error).toBe("Path must start with / (also rejected: b)");
	});
	it("splits on commas and newlines, adding the valid parts and keeping the invalid ones", () => {
		expect(addChips([], "/a, nope,/b\n/c", "path")).toEqual({
			chips: ["/a", "/b", "/c"],
			rest: "nope",
			error: "Path must start with /",
		});
		expect(addChips([], "nope,/ok,also bad", "path")).toEqual({
			chips: ["/ok"],
			rest: "nope",
			error: "Path must start with / (also rejected: also bad)",
		});
		expect(addChips(["en"], "fr,en,de", "locale")).toEqual({ chips: ["en", "fr", "de"], rest: "", error: null });
	});
});
