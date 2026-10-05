import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * EmDash's admin ships *precompiled* Tailwind CSS built from its own source, so a utility class
 * that only this plugin uses does not exist on the page. Guard every Tailwind class in
 * src/admin/*.tsx against the installed admin stylesheet. (Rules the admin lacks belong in
 * src/admin/styles.tsx under `hfc-` names, which are skipped here.)
 */

const ADMIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "admin");

function findAdminStylesheet(): string | null {
	try {
		const require = createRequire(import.meta.url);
		const emdashEntry = require.resolve("emdash");
		return createRequire(emdashEntry).resolve("@emdash-cms/admin/styles.css");
	} catch {
		return null;
	}
}

/** Class tokens from className="…", className={…} and cn(…) string literals. */
export function extractClasses(src: string): string[] {
	const chunks: string[] = [];
	for (const m of src.matchAll(/className=("[^"]*")/g)) chunks.push(m[1]!);
	for (const m of src.matchAll(/className=\{([^}]*)\}/g)) chunks.push(m[1]!);
	for (const m of src.matchAll(/\bcn\(([\s\S]*?)\)\s*[,}\n]/g)) chunks.push(m[1]!);
	const classes = new Set<string>();
	for (const chunk of chunks) {
		for (const lit of chunk.matchAll(/"([^"]*)"/g)) {
			for (const c of lit[1]!.split(/\s+/)) if (c && !c.startsWith("hfc-")) classes.add(c);
		}
	}
	return [...classes].sort();
}

/** Tailwind's selector escaping: every non-identifier character gets a backslash. */
function selectorFor(cls: string): RegExp {
	const escaped = `.${cls.replace(/([^a-zA-Z0-9_-])/g, "\\$1")}`;
	return new RegExp(`${escaped.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}(?![\\w-])`);
}

const cssPath = findAdminStylesheet();
const css = cssPath && existsSync(cssPath) ? readFileSync(cssPath, "utf8") : null;
if (!css) {
	console.warn(
		"[admin-classes] Skipping: @emdash-cms/admin/styles.css could not be resolved from the installed emdash package.",
	);
}

describe.skipIf(!css)("admin Tailwind classes exist in EmDash's precompiled admin CSS", () => {
	const files = readdirSync(ADMIN_DIR).filter((f) => f.endsWith(".tsx"));

	it("finds the classes it should check (scanner sanity)", () => {
		const all = files.flatMap((f) => extractClasses(readFileSync(join(ADMIN_DIR, f), "utf8")));
		expect(all.length).toBeGreaterThan(50);
		expect(selectorFor("text-kumo-subtle").test(css!)).toBe(true);
		expect(selectorFor("definitely-not-a-tailwind-class-xyz").test(css!)).toBe(false);
	});

	it.each(files)("%s uses only classes the admin stylesheet defines", (file) => {
		const missing = extractClasses(readFileSync(join(ADMIN_DIR, file), "utf8")).filter(
			(c) => !selectorFor(c).test(css!),
		);
		expect(missing).toEqual([]);
	});
});
