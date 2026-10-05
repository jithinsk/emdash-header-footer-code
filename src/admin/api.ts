import { apiFetch } from "emdash/plugin-utils";
import type { ChangeLogEntry, EditableSnippet, Snippet } from "../core/types.js";

const BASE = "/_emdash/api/plugins/header-footer-code";

export type SnippetSummary = Omit<Snippet, "code"> & { code?: string };
export interface ListResponse {
	disabled: boolean;
	canManage: boolean;
	snippets: SnippetSummary[];
}

export class ApiError extends Error {
	constructor(
		message: string,
		public fieldErrors: Record<string, string> = {},
	) {
		super(message);
	}
}

async function call<T>(route: string, payload?: unknown): Promise<T> {
	const init: RequestInit =
		payload === undefined
			? { method: "GET" }
			: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
	const res = await apiFetch(`${BASE}/${route}`, init);
	const json = (await res.json().catch(() => ({}))) as {
		data?: T;
		error?: { message?: string; details?: { errors?: Record<string, string> } };
	};
	if (!res.ok) {
		throw new ApiError(json.error?.message ?? `Request failed (${res.status})`, json.error?.details?.errors ?? {});
	}
	return json.data as T;
}

export const api = {
	list: () => call<ListResponse>("snippets/list"),
	get: (id: string) => call<{ snippet: Snippet }>("snippets/get", { id }),
	save: (draft: EditableSnippet & { id?: string }) => call<{ snippet: Snippet }>("snippets/save", draft),
	toggle: (id: string, enabled: boolean) => call<{ snippet: Snippet }>("snippets/toggle", { id, enabled }),
	duplicate: (id: string) => call<{ snippet: Snippet }>("snippets/duplicate", { id }),
	remove: (id: string) => call<{ deleted: true }>("snippets/delete", { id }),
	setKillSwitch: (disabled: boolean) => call<{ disabled: boolean }>("killswitch/set", { disabled }),
	changelog: () => call<{ entries: ChangeLogEntry[] }>("changelog/list"),
};
