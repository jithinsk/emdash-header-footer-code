import type { KVAccess } from "emdash";
import { DEFAULT_STATE, type PluginState } from "./core/types.js";

export const STATE_KEY = "state";
const MAX_ATTEMPTS = 5;

export async function readState(kv: Pick<KVAccess, "get">): Promise<PluginState> {
	return (await kv.get<PluginState>(STATE_KEY)) ?? { ...DEFAULT_STATE };
}

/** Atomically bump `rev` (and optionally set `disabled`). Retries on conflict. */
export async function bumpState(
	kv: Pick<KVAccess, "getVersioned" | "compareAndSet">,
	change: { disabled?: boolean } = {},
): Promise<PluginState> {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const current = await kv.getVersioned<PluginState>(STATE_KEY);
		const base = current?.value ?? DEFAULT_STATE;
		const next: PluginState = { ...base, ...change, rev: base.rev + 1 };
		const result = await kv.compareAndSet(STATE_KEY, current?.revision ?? null, next);
		if (result.applied) return next;
	}
	throw new Error(`Could not update plugin state after ${MAX_ATTEMPTS} attempts`);
}
