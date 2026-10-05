export type PathMatcher = (path: string) => boolean;

const WHITESPACE = /\s/;
const TRAILING_SLASHES = /\/+$/;

/** Returns an error message, or null when the pattern is valid. */
export function validatePattern(pattern: string): string | null {
	if (!pattern.startsWith("/")) return "Path must start with /";
	if (WHITESPACE.test(pattern)) return "Path must not contain whitespace";
	const star = pattern.indexOf("*");
	if (star !== -1 && star !== pattern.length - 1) return "* is only allowed at the end of a path";
	return null;
}

/** Strip trailing slashes, keeping "/" for the root. Case-sensitive. */
export function normalizePath(path: string): string {
	if (path === "/") return path;
	const stripped = path.replace(TRAILING_SLASHES, "");
	return stripped === "" ? "/" : stripped;
}

/** Compile a validated pattern into a matcher. Throws on invalid patterns. */
export function compilePattern(pattern: string): PathMatcher {
	const error = validatePattern(pattern);
	if (error) throw new Error(error);
	if (pattern.endsWith("*")) {
		const prefix = pattern.slice(0, -1);
		return (path) => normalizePath(path).startsWith(prefix);
	}
	const exact = normalizePath(pattern);
	return (path) => normalizePath(path) === exact;
}
