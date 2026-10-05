import { compilePattern, type PathMatcher } from "./paths.js";
import type { Logger, PageInfo, Snippet } from "./types.js";

export interface CompiledSnippet {
	snippet: Snippet;
	include: PathMatcher[];
	exclude: PathMatcher[];
}

export function isAdminPath(path: string): boolean {
	return path.startsWith("/_emdash/");
}

export function compileSnippet(snippet: Snippet): CompiledSnippet {
	return {
		snippet,
		include: snippet.includePaths.map(compilePattern),
		exclude: snippet.excludePaths.map(compilePattern),
	};
}

export function compareSnippets(a: Snippet, b: Snippet): number {
	if (a.priority !== b.priority) return a.priority - b.priority;
	if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Enabled snippets, sorted, with compiled matchers. Invalid ones are skipped and logged. */
export function prepareSnippets(list: Snippet[], log: Logger): CompiledSnippet[] {
	const out: CompiledSnippet[] = [];
	for (const snippet of [...list].sort(compareSnippets)) {
		if (!snippet.enabled) continue;
		try {
			out.push(compileSnippet(snippet));
		} catch (error) {
			log.warn("Skipping snippet with an invalid path pattern", {
				snippetId: snippet.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return out;
}

export function matchesPage(c: CompiledSnippet, page: PageInfo): boolean {
	const { snippet } = c;
	if (snippet.pageKind !== "all" && snippet.pageKind !== page.kind) return false;
	if (snippet.locales.length > 0 && (page.locale === null || !snippet.locales.includes(page.locale))) {
		return false;
	}
	if (c.include.length > 0 && !c.include.some((m) => m(page.path))) return false;
	if (c.exclude.some((m) => m(page.path))) return false;
	return true;
}
