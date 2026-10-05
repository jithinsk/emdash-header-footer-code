import { validatePattern } from "../core/paths.js";

/** Pure add/validate logic behind ChipInput (unit-tested in node). */

export type ChipKind = "path" | "locale";

const WHITESPACE = /\s/;
const SEPARATORS = /[,\n]/;

/** Returns an error message, or null when `value` (already trimmed) is a valid chip. */
export function validateChip(value: string, kind: ChipKind): string | null {
	if (kind === "path") return validatePattern(value);
	if (value === "") return "Locale must not be empty";
	if (WHITESPACE.test(value)) return "Locale must not contain spaces";
	return null;
}

export interface AddChipsResult {
	/** The new chip list (unchanged when nothing valid was entered). */
	chips: string[];
	/** Text to leave in the input: the invalid parts, or "" when everything was added. */
	rest: string;
	/** Reason the first invalid part was rejected, or null. */
	error: string | null;
}

/**
 * Add the comma/newline-separated values in `raw` to `chips`. Valid values are trimmed and
 * added once (no duplicates); invalid ones stay in the input with the first error.
 */
export function addChips(chips: readonly string[], raw: string, kind: ChipKind): AddChipsResult {
	const next = [...chips];
	const rejected: string[] = [];
	let error: string | null = null;
	for (const part of raw.split(SEPARATORS)) {
		const value = part.trim();
		if (value === "") continue;
		const err = validateChip(value, kind);
		if (err) {
			rejected.push(value);
			error ??= err;
			continue;
		}
		if (!next.includes(value)) next.push(value);
	}
	return { chips: next, rest: rejected.join(", "), error };
}
