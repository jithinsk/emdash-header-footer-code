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
