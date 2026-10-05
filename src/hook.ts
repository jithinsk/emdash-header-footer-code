import type { PageFragmentContribution } from "emdash";
import type { CacheContext, SnippetCache } from "./cache.js";
import { isAdminPath } from "./core/match.js";
import { renderFragments } from "./core/pipeline.js";
import type { PageInfo, Transform } from "./core/types.js";

export function createFragmentsHandler(cache: SnippetCache, transforms: readonly Transform[]) {
	return async function handlePageFragments(
		event: { page: PageInfo },
		ctx: CacheContext,
	): Promise<PageFragmentContribution[] | null> {
		const { page } = event;
		if (isAdminPath(page.path)) return null;
		try {
			const { disabled, snippets } = await cache.load(ctx);
			if (disabled || snippets.length === 0) return null;
			const fragments = renderFragments(snippets, page, transforms, ctx.log);
			return fragments.length > 0 ? fragments : null;
		} catch (error) {
			ctx.log.error("Header & Footer Code: failed to render snippets", {
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	};
}
