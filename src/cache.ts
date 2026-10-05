import type { KVAccess } from "emdash";
import { type CompiledSnippet, prepareSnippets } from "./core/match.js";
import type { Logger, PluginState } from "./core/types.js";
import { loadAllSnippets, type SnippetCollection } from "./repo.js";
import { readState } from "./state.js";

export interface CacheContext {
	kv: Pick<KVAccess, "get">;
	storage: { snippets: Pick<SnippetCollection, "query"> };
	log: Logger;
}

export interface SnippetCache {
	load(ctx: CacheContext): Promise<{ disabled: boolean; snippets: CompiledSnippet[] }>;
	/** Drop the coalesced state so the next load re-reads it (call after writes). */
	invalidate(): void;
}

/**
 * Per-isolate cache. The kv `state` read is shared for `stateTtlMs`. This covers
 * the up-to-3 page:fragments calls per request and bursts of concurrent requests.
 * The compiled snippet list is rebuilt only when `state.rev` changes.
 */
export function createSnippetCache(opts: { now?: () => number; stateTtlMs?: number } = {}): SnippetCache {
	const now = opts.now ?? Date.now;
	const ttl = opts.stateTtlMs ?? 1000;
	let statePromise: Promise<PluginState> | null = null;
	let stateReadAt = 0;
	let cachedRev: number | null = null;
	let compiled: CompiledSnippet[] = [];

	function getState(ctx: CacheContext): Promise<PluginState> {
		const t = now();
		if (!statePromise || t - stateReadAt >= ttl) {
			stateReadAt = t;
			const p = readState(ctx.kv);
			statePromise = p;
			p.catch(() => {
				if (statePromise === p) statePromise = null;
			});
		}
		return statePromise;
	}

	return {
		async load(ctx) {
			const state = await getState(ctx);
			if (state.disabled) return { disabled: true, snippets: [] };
			if (cachedRev !== state.rev) {
				const list = await loadAllSnippets(ctx.storage.snippets);
				compiled = prepareSnippets(list, ctx.log);
				cachedRev = state.rev;
			}
			return { disabled: false, snippets: compiled };
		},
		invalidate() {
			statePromise = null;
		},
	};
}
