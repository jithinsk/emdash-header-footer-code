import type { ResolvedPlugin } from "emdash";
import { definePlugin } from "emdash";
import type { CacheContext } from "./cache.js";
import { createSnippetCache } from "./cache.js";
import type { Transform } from "./core/types.js";
import { createFragmentsHandler } from "./hook.js";
import { createRoutes } from "./routes.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "./version.js";

export type { Transform, TransformContext, TransformResult, Snippet } from "./core/types.js";

export interface HeaderFooterCodeRuntimeOptions {
	/** Appended after the built-in transforms (none in v0.1). Pass via a wrapper entrypoint — see README. */
	transforms?: Transform[];
}

const BUILTIN_TRANSFORMS: readonly Transform[] = [];

export const ADMIN_ENTRY = "emdash-header-footer-code/admin";
export const ADMIN_PAGES = [{ path: "/snippets", label: "Header & Footer Code", icon: "code" }];

export function createPlugin(options: HeaderFooterCodeRuntimeOptions = {}): ResolvedPlugin {
	const transforms = [...BUILTIN_TRANSFORMS, ...(options.transforms ?? [])];
	const cache = createSnippetCache();
	const fragments = createFragmentsHandler(cache, transforms);

	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: ["hooks.page-fragments:register"],
		storage: {
			snippets: { indexes: ["createdAt"] },
			changelog: { indexes: ["at"] },
		},
		admin: { entry: ADMIN_ENTRY, pages: ADMIN_PAGES },
		hooks: {
			"page:fragments": {
				// ctx.storage.snippets is StorageCollection<unknown> at the type level.
				handler: (event, ctx) => fragments(event, ctx as unknown as CacheContext),
			},
		},
		routes: createRoutes({ cache, now: () => new Date().toISOString(), newId: () => crypto.randomUUID() }),
	});
}
