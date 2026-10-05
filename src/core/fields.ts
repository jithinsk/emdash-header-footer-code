import type { EditableSnippet } from "./types.js";

export type FieldType = "text" | "code" | "select" | "toggle" | "number" | "pathList" | "localeList";

export interface FieldDef {
	/** Top-level snippet key, or a dotted path into meta such as "meta.consentCategory". */
	name: string;
	label: string;
	type: FieldType;
	options?: { value: string; label: string }[];
	help?: string;
	required?: boolean;
	/** Hidden from viewers with only plugins:read. */
	manageOnly?: boolean;
}

/** Add a field here (for example meta.consentCategory) to add it to the edit form. */
export const FIELDS: readonly FieldDef[] = [
	{ name: "name", label: "Name", type: "text", required: true, help: "Shown in the admin list only." },
	{
		name: "code",
		label: "Code",
		type: "code",
		required: true,
		manageOnly: true,
		help: "Raw HTML: <script>, <style>, <noscript>, <meta>, … Output exactly as written. Max 64 KB.",
	},
	{
		name: "placement",
		label: "Placement",
		type: "select",
		options: [
			{ value: "head", label: "Head" },
			{ value: "body:start", label: "Body start" },
			{ value: "body:end", label: "Body end" },
		],
	},
	{ name: "enabled", label: "Enabled", type: "toggle" },
	{ name: "priority", label: "Priority", type: "number", help: "Lower runs first within the same placement." },
	{
		name: "includePaths",
		label: "Include paths",
		type: "pathList",
		help: "One per line, e.g. / or /blog/*. Leave empty for every page.",
	},
	{ name: "excludePaths", label: "Exclude paths", type: "pathList", help: "One per line. Wins over include." },
	{
		name: "pageKind",
		label: "Page kind",
		type: "select",
		options: [
			{ value: "all", label: "All pages" },
			{ value: "content", label: "Content pages" },
			{ value: "custom", label: "Custom pages" },
		],
	},
	{ name: "locales", label: "Locales", type: "localeList", help: "One per line, e.g. en. Leave empty for all." },
];

export function getFieldValue(draft: Record<string, any>, name: string): unknown {
	let cur: unknown = draft;
	for (const part of name.split(".")) {
		if (typeof cur !== "object" || cur === null) return undefined;
		cur = (cur as Record<string, any>)[part];
	}
	return cur;
}

export function setFieldValue<T extends Record<string, any>>(draft: T, name: string, value: unknown): T {
	const [head, ...rest] = name.split(".");
	if (rest.length === 0) return { ...draft, [head!]: value };
	const child = draft[head!];
	const base = typeof child === "object" && child !== null ? (child as Record<string, any>) : {};
	return { ...draft, [head!]: setFieldValue(base, rest.join("."), value) };
}

export function emptyDraft(): EditableSnippet {
	return {
		name: "",
		code: "",
		placement: "head",
		enabled: true,
		priority: 10,
		includePaths: [],
		excludePaths: [],
		pageKind: "all",
		locales: [],
		meta: {},
	};
}
