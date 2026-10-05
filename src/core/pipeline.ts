import type { PageFragmentContribution } from "emdash";
import { type CompiledSnippet, matchesPage } from "./match.js";
import type { Logger, PageInfo, Transform } from "./types.js";

/** match → (already sorted) → transform → emit */
export function renderFragments(
	compiled: CompiledSnippet[],
	page: PageInfo,
	transforms: readonly Transform[],
	log: Logger,
): PageFragmentContribution[] {
	const snippetFragments: PageFragmentContribution[] = [];
	const extraFragments: PageFragmentContribution[] = [];
	const seenExtraKeys = new Set<string>();

	for (const c of compiled) {
		if (!matchesPage(c, page)) continue;
		const { snippet } = c;
		let html: string | null = snippet.code;

		for (let i = 0; i < transforms.length && html !== null; i++) {
			const transform = transforms[i]!;
			try {
				const result = transform({ snippet, html, page });
				if (result === null || typeof result === "string") {
					html = result;
				} else {
					html = result.html;
					for (const fragment of result.fragments ?? []) {
						if (fragment.key !== undefined) {
							if (seenExtraKeys.has(fragment.key)) continue;
							seenExtraKeys.add(fragment.key);
						}
						extraFragments.push(fragment);
					}
				}
			} catch (error) {
				log.error("Snippet transform failed; skipping snippet", {
					snippetId: snippet.id,
					transformIndex: i,
					error: error instanceof Error ? error.message : String(error),
				});
				html = null;
			}
		}

		if (html !== null) {
			snippetFragments.push({ kind: "html", placement: snippet.placement, html, key: `hfc-${snippet.id}` });
		}
	}

	return [...snippetFragments, ...extraFragments];
}
