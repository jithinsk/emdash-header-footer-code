import type { StorageCollection } from "emdash";
import type { ChangeLogEntry, Snippet, UserRef } from "./core/types.js";
import { LIMITS } from "./core/validate.js";

export type SnippetCollection = StorageCollection<Snippet>;
export type LogCollection = StorageCollection<ChangeLogEntry>;

/** All snippets in one query. The 100-snippet cap keeps this to a single page. */
export async function loadAllSnippets(c: Pick<SnippetCollection, "query">): Promise<Snippet[]> {
	const { items } = await c.query({ orderBy: { createdAt: "asc" }, limit: LIMITS.maxSnippets });
	return items.map((i) => i.data);
}

export function userRef(user: { id: string; name: string | null; email: string } | undefined): UserRef {
	return user ? { id: user.id, name: user.name, email: user.email } : { id: "unknown", name: null, email: null };
}

export async function appendLog(
	c: Pick<LogCollection, "put">,
	entry: Omit<ChangeLogEntry, "id">,
	newId: () => string,
): Promise<ChangeLogEntry> {
	const full: ChangeLogEntry = { id: newId(), ...entry };
	await c.put(full.id, full);
	return full;
}

export async function listLog(c: Pick<LogCollection, "query">): Promise<ChangeLogEntry[]> {
	const { items } = await c.query({ orderBy: { at: "desc" }, limit: 100 });
	return items.map((i) => i.data);
}
