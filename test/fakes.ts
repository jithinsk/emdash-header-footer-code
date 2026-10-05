import type { Logger, PageInfo, Snippet } from "../src/core/types.js";

let seq = 0;
export function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
	seq += 1;
	const user = { id: "u1", name: "Admin", email: "admin@example.com" };
	return {
		id: `s${seq}`,
		schemaVersion: 1,
		name: `Snippet ${seq}`,
		code: `<!-- snippet ${seq} -->`,
		placement: "head",
		enabled: true,
		priority: 10,
		includePaths: [],
		excludePaths: [],
		pageKind: "all",
		locales: [],
		meta: {},
		createdAt: new Date(Date.UTC(2026, 9, 5, 0, 0, seq)).toISOString(),
		updatedAt: new Date(Date.UTC(2026, 9, 5, 0, 0, seq)).toISOString(),
		createdBy: user,
		updatedBy: user,
		...overrides,
	};
}

export function makePage(overrides: Partial<PageInfo> = {}): PageInfo {
	return {
		url: "https://example.com/",
		path: "/",
		locale: null,
		kind: "custom",
		pageType: "home",
		title: null,
		description: null,
		canonical: null,
		image: null,
		...overrides,
	};
}

export function makeLogger() {
	const warns: unknown[][] = [];
	const errors: unknown[][] = [];
	const log: Logger & { warns: unknown[][]; errors: unknown[][] } = {
		warns,
		errors,
		warn: (...args: unknown[]) => void warns.push(args),
		error: (...args: unknown[]) => void errors.push(args),
	};
	return log;
}
