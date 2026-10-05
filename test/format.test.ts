import { describe, expect, it } from "vitest";
import {
	ACTION_META,
	PLACEMENT_LABEL,
	filterSnippets,
	formatTimestamp,
	relativeTime,
	userLabel,
	whereSummary,
} from "../src/admin/format.js";

const base = {
	placement: "head" as const,
	includePaths: [] as string[],
	excludePaths: [] as string[],
	pageKind: "all" as const,
	locales: [] as string[],
};

describe("whereSummary", () => {
	it("says All pages when nothing narrows it", () => {
		expect(whereSummary(base)).toBe("Head · All pages");
	});
	it("lists include and exclude paths, page kind and locales", () => {
		expect(
			whereSummary({
				...base,
				includePaths: ["/blog/*"],
				excludePaths: ["/blog/draft-*"],
				pageKind: "content",
				locales: ["en"],
			}),
		).toBe("Head · /blog/* · excl. /blog/draft-* · content pages · en");
	});
	it("joins multiple paths and locales with commas", () => {
		expect(
			whereSummary({
				...base,
				placement: "body:end",
				includePaths: ["/", "/about"],
				excludePaths: ["/a", "/b"],
				pageKind: "custom",
				locales: ["en", "fr"],
			}),
		).toBe("Body end · /, /about · excl. /a, /b · custom pages · en, fr");
	});
	it("keeps All pages when only excludes are set", () => {
		expect(whereSummary({ ...base, placement: "body:start", excludePaths: ["/x"] })).toBe(
			"Body start · All pages · excl. /x",
		);
	});
	it("labels every placement", () => {
		expect(PLACEMENT_LABEL).toEqual({ head: "Head", "body:start": "Body start", "body:end": "Body end" });
	});
});

describe("relativeTime", () => {
	const now = new Date(2026, 9, 5, 15, 0, 0); // local time, so the test is timezone-independent
	const at = (d: Date) => d.toISOString();

	it("says just now for under a minute, and for clock skew into the future", () => {
		expect(relativeTime(at(new Date(2026, 9, 5, 14, 59, 30)), now)).toBe("just now");
		expect(relativeTime(at(new Date(2026, 9, 5, 15, 0, 20)), now)).toBe("just now");
	});
	it("counts minutes", () => {
		expect(relativeTime(at(new Date(2026, 9, 5, 14, 59, 0)), now)).toBe("1 min ago");
		expect(relativeTime(at(new Date(2026, 9, 5, 14, 57, 0)), now)).toBe("3 min ago");
		expect(relativeTime(at(new Date(2026, 9, 5, 14, 1, 0)), now)).toBe("59 min ago");
	});
	it("counts hours on the same day", () => {
		expect(relativeTime(at(new Date(2026, 9, 5, 14, 0, 0)), now)).toBe("1 hour ago");
		expect(relativeTime(at(new Date(2026, 9, 5, 0, 30, 0)), now)).toBe("14 hours ago");
	});
	it("says yesterday for the previous calendar day", () => {
		expect(relativeTime(at(new Date(2026, 9, 4, 23, 30, 0)), new Date(2026, 9, 5, 1, 0, 0))).toBe("yesterday");
		expect(relativeTime(at(new Date(2026, 9, 4, 8, 0, 0)), now)).toBe("yesterday");
	});
	it("shows a date for anything older", () => {
		expect(relativeTime(at(new Date(2026, 9, 1, 8, 0, 0)), now, "en-US")).toBe("Oct 1");
		expect(relativeTime(at(new Date(2025, 11, 31, 8, 0, 0)), now, "en-US")).toBe("Dec 31, 2025");
	});
	it("accepts a numeric now and tolerates bad input", () => {
		expect(relativeTime(at(new Date(2026, 9, 5, 14, 57, 0)), now.getTime())).toBe("3 min ago");
		expect(relativeTime("not a date", now)).toBe("not a date");
	});
});

describe("formatTimestamp", () => {
	it("formats a full local timestamp and passes bad input through", () => {
		expect(formatTimestamp(new Date(2026, 9, 5, 15, 4, 0).toISOString(), "en-US").replace(/\u202f/g, " ")).toBe("Oct 5, 2026, 3:04 PM");
		expect(formatTimestamp("nope")).toBe("nope");
	});
});

describe("userLabel", () => {
	it("prefers name, then email, then id", () => {
		expect(userLabel({ id: "u1", name: "Ada", email: "a@x" })).toBe("Ada");
		expect(userLabel({ id: "u1", name: null, email: "a@x" })).toBe("a@x");
		expect(userLabel({ id: "u1", name: null, email: null })).toBe("u1");
	});
});

describe("ACTION_META", () => {
	it("labels and colour-codes every change-log action", () => {
		expect(Object.fromEntries(Object.entries(ACTION_META).map(([k, v]) => [k, v.label]))).toEqual({
			create: "Created",
			update: "Edited",
			enable: "Enabled",
			disable: "Disabled",
			duplicate: "Duplicated",
			delete: "Deleted",
			killswitch_on: "Output off",
			killswitch_off: "Output on",
		});
		expect(ACTION_META.delete.variant).toBe("error");
		expect(ACTION_META.create.variant).toBe("success");
		expect(ACTION_META.killswitch_on.variant).toBe("warning");
	});
});

describe("filterSnippets", () => {
	const list = [
		{ name: "Google Analytics", placement: "head" as const },
		{ name: "Chat widget", placement: "body:end" as const },
		{ name: "GTM noscript", placement: "body:start" as const },
	];
	it("returns everything with no filters", () => {
		expect(filterSnippets(list, { query: "", placement: "all" })).toEqual(list);
	});
	it("matches names case-insensitively, ignoring surrounding whitespace", () => {
		expect(filterSnippets(list, { query: "  g ", placement: "all" }).map((s) => s.name)).toEqual([
			"Google Analytics",
			"Chat widget",
			"GTM noscript",
		]);
		expect(filterSnippets(list, { query: "GOOGLE", placement: "all" }).map((s) => s.name)).toEqual([
			"Google Analytics",
		]);
	});
	it("filters by placement, combined with the query", () => {
		expect(filterSnippets(list, { query: "", placement: "body:end" }).map((s) => s.name)).toEqual(["Chat widget"]);
		expect(filterSnippets(list, { query: "chat", placement: "head" })).toEqual([]);
	});
});
