import { validatePattern } from "./paths.js";
import { type EditableSnippet, PAGE_KINDS, PLACEMENTS, type Snippet } from "./types.js";

export const LIMITS = {
	maxSnippetBytes: 64 * 1024,
	maxTotalBytes: 512 * 1024,
	maxSnippets: 100,
	maxNameLength: 200,
} as const;

export type SnippetInput = Omit<EditableSnippet, "meta"> & { meta?: Record<string, unknown> };
export type ValidationResult =
	| { ok: true; value: SnippetInput }
	| { ok: false; errors: Record<string, string> };

const encoder = new TextEncoder();
export function byteLength(s: string): number {
	return encoder.encode(s).length;
}
export function formatKB(bytes: number): string {
	return `${(bytes / 1024).toFixed(1)} KB`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringList(v: unknown): string[] | null {
	if (v === undefined) return [];
	if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return null;
	return v.map((x) => x.trim()).filter((x) => x !== "");
}

function pathListError(list: string[]): string | null {
	for (const p of list) {
		const err = validatePattern(p);
		if (err) return `${p}: ${err}`;
	}
	return null;
}

export function validateSnippetInput(input: unknown): ValidationResult {
	if (!isPlainObject(input)) return { ok: false, errors: { _form: "Invalid request body" } };
	const errors: Record<string, string> = {};

	const name = typeof input.name === "string" ? input.name.trim() : "";
	if (!name) errors.name = "Name is required";
	else if (name.length > LIMITS.maxNameLength) errors.name = "Name must be at most 200 characters";

	const code = typeof input.code === "string" ? input.code : "";
	if (code.trim() === "") errors.code = "Code is required";

	const placement = input.placement ?? "head";
	if (!PLACEMENTS.includes(placement as never)) {
		errors.placement = `Placement must be one of ${PLACEMENTS.join(", ")}`;
	}

	const pageKind = input.pageKind ?? "all";
	if (!PAGE_KINDS.includes(pageKind as never)) {
		errors.pageKind = `Page kind must be one of ${PAGE_KINDS.join(", ")}`;
	}

	const enabled = input.enabled ?? true;
	if (typeof enabled !== "boolean") errors.enabled = "Enabled must be true or false";

	const priority = input.priority ?? 10;
	if (typeof priority !== "number" || !Number.isInteger(priority)) {
		errors.priority = "Priority must be a whole number";
	}

	const includePaths = stringList(input.includePaths);
	if (includePaths === null) errors.includePaths = "Include paths must be a list of paths";
	else {
		const err = pathListError(includePaths);
		if (err) errors.includePaths = err;
	}

	const excludePaths = stringList(input.excludePaths);
	if (excludePaths === null) errors.excludePaths = "Exclude paths must be a list of paths";
	else {
		const err = pathListError(excludePaths);
		if (err) errors.excludePaths = err;
	}

	let locales: string[] = [];
	if (input.locales !== undefined) {
		if (!Array.isArray(input.locales) || !input.locales.every((l) => typeof l === "string" && l.trim() !== "")) {
			errors.locales = "Locales must be non-empty strings";
		} else {
			locales = input.locales.map((l: string) => l.trim());
		}
	}

	let meta: Record<string, unknown> | undefined;
	if (input.meta !== undefined) {
		if (!isPlainObject(input.meta)) errors.meta = "Meta must be an object";
		else meta = input.meta;
	}

	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return {
		ok: true,
		value: {
			name,
			code,
			placement: placement as SnippetInput["placement"],
			enabled: enabled as boolean,
			priority: priority as number,
			includePaths: includePaths!,
			excludePaths: excludePaths!,
			pageKind: pageKind as SnippetInput["pageKind"],
			locales,
			meta,
		},
	};
}

/** Size and count limits. `candidate.id` set = update of an existing snippet. */
export function checkLimits(
	candidate: { id?: string; code: string },
	existing: Snippet[],
): Record<string, string> | null {
	const isUpdate = candidate.id !== undefined && existing.some((s) => s.id === candidate.id);
	if (!isUpdate && existing.length >= LIMITS.maxSnippets) {
		return { _form: `You can have at most ${LIMITS.maxSnippets} snippets` };
	}
	const size = byteLength(candidate.code);
	if (size > LIMITS.maxSnippetBytes) {
		return { code: `Code is ${formatKB(size)}; the limit is 64 KB per snippet` };
	}
	const others = existing
		.filter((s) => s.id !== candidate.id)
		.reduce((sum, s) => sum + byteLength(s.code), 0);
	const total = others + size;
	if (total > LIMITS.maxTotalBytes) {
		return { code: `Total code would be ${formatKB(total)}; the limit is 512 KB across all snippets` };
	}
	return null;
}
