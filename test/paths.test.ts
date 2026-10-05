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
