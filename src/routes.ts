import type { PluginRoute, RouteContext } from "emdash";
import { PluginRouteError } from "emdash";
import type { SnippetCache } from "./cache.js";
import type { ChangeLogAction, Snippet } from "./core/types.js";
import { checkLimits, validateSnippetInput } from "./core/validate.js";
import {
	appendLog,
	listLog,
	loadAllSnippets,
	type LogCollection,
	type SnippetCollection,
	userRef,
} from "./repo.js";
import { bumpState, readState } from "./state.js";

/** Mirrors Role.ADMIN in @emdash-cms/auth (plugins:manage). */
const ROLE_ADMIN = 50;
const SCHEMA_VERSION = 1;

export interface RouteDeps {
	cache: Pick<SnippetCache, "invalidate">;
	now: () => string;
	newId: () => string;
}

type Ctx = RouteContext<unknown>;

export type SnippetSummary = Omit<Snippet, "code"> & { code?: string };

function cols(ctx: Ctx) {
	return {
		snippets: ctx.storage.snippets as unknown as SnippetCollection,
		changelog: ctx.storage.changelog as unknown as LogCollection,
	};
}

function body(ctx: Ctx): Record<string, unknown> {
	const input = ctx.input;
	return typeof input === "object" && input !== null && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: {};
}

function requireId(ctx: Ctx): string {
	const id = body(ctx).id;
	if (typeof id !== "string" || id === "") throw PluginRouteError.badRequest("Missing snippet id");
	return id;
}

async function requireSnippet(ctx: Ctx, id: string): Promise<Snippet> {
	const snippet = await cols(ctx).snippets.get(id);
	if (!snippet) throw new PluginRouteError("NOT_FOUND", "Snippet not found", 404);
	return snippet;
}

function assertWritable(snippet: Snippet) {
	if (snippet.schemaVersion > SCHEMA_VERSION) {
		throw new PluginRouteError(
			"UNSUPPORTED_SCHEMA",
			"This snippet was saved by a newer version of the plugin. Upgrade the plugin to edit it.",
			409,
		);
	}
}

export function createRoutes(deps: RouteDeps) {
	/** Log, bump rev, invalidate. Runs after every successful write. */
	async function afterWrite(ctx: Ctx, action: ChangeLogAction, snippet: Pick<Snippet, "id" | "name"> | null, change?: { disabled?: boolean }) {
		await appendLog(
			cols(ctx).changelog,
			{
				at: deps.now(),
				user: userRef(ctx.user),
				action,
				snippetId: snippet?.id ?? null,
				snippetName: snippet?.name ?? null,
			},
			deps.newId,
		);
		const state = await bumpState(ctx.kv, change);
		deps.cache.invalidate();
		return state;
	}

	const routes = {
		"snippets/list": {
			permission: "plugins:read",
			handler: async (ctx: Ctx) => {
				const canManage = (ctx.user?.role ?? 0) >= ROLE_ADMIN;
				const [state, all] = await Promise.all([readState(ctx.kv), loadAllSnippets(cols(ctx).snippets)]);
				const snippets: SnippetSummary[] = canManage ? all : all.map(({ code: _code, ...rest }) => rest);
				return { disabled: state.disabled, canManage, snippets };
			},
		},

		"snippets/get": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => ({ snippet: await requireSnippet(ctx, requireId(ctx)) }),
		},

		"snippets/save": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const input = body(ctx);
				const id = typeof input.id === "string" && input.id !== "" ? input.id : undefined;
				const result = validateSnippetInput(input);
				if (!result.ok) throw PluginRouteError.badRequest("Validation failed", { errors: result.errors });

				const all = await loadAllSnippets(cols(ctx).snippets);
				const existing = id ? all.find((s) => s.id === id) : undefined;
				if (id && !existing) throw new PluginRouteError("NOT_FOUND", "Snippet not found", 404);
				if (existing) assertWritable(existing);

				const limitErrors = checkLimits({ id, code: result.value.code }, all);
				if (limitErrors) throw PluginRouteError.badRequest("Validation failed", { errors: limitErrors });

				const now = deps.now();
				const user = userRef(ctx.user);
				const { meta, ...fields } = result.value;
				const snippet: Snippet = existing
					? { ...existing, ...fields, meta: meta ?? existing.meta, updatedAt: now, updatedBy: user }
					: {
							id: deps.newId(),
							schemaVersion: SCHEMA_VERSION,
							...fields,
							meta: meta ?? {},
							createdAt: now,
							updatedAt: now,
							createdBy: user,
							updatedBy: user,
						};
				await cols(ctx).snippets.put(snippet.id, snippet);
				await afterWrite(ctx, existing ? "update" : "create", snippet);
				return { snippet };
			},
		},

		"snippets/toggle": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const id = requireId(ctx);
				const enabled = body(ctx).enabled;
				if (typeof enabled !== "boolean") throw PluginRouteError.badRequest("enabled must be true or false");
				const current = await requireSnippet(ctx, id);
				assertWritable(current);
				const snippet: Snippet = { ...current, enabled, updatedAt: deps.now(), updatedBy: userRef(ctx.user) };
				await cols(ctx).snippets.put(id, snippet);
				await afterWrite(ctx, enabled ? "enable" : "disable", snippet);
				return { snippet };
			},
		},

		"snippets/duplicate": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const source = await requireSnippet(ctx, requireId(ctx));
				const all = await loadAllSnippets(cols(ctx).snippets);
				const limitErrors = checkLimits({ code: source.code }, all);
				if (limitErrors) throw PluginRouteError.badRequest("Validation failed", { errors: limitErrors });
				const now = deps.now();
				const user = userRef(ctx.user);
				const snippet: Snippet = {
					...structuredClone(source),
					id: deps.newId(),
					name: `${source.name} (copy)`.slice(0, 200),
					enabled: false,
					createdAt: now,
					updatedAt: now,
					createdBy: user,
					updatedBy: user,
				};
				await cols(ctx).snippets.put(snippet.id, snippet);
				await afterWrite(ctx, "duplicate", snippet);
				return { snippet };
			},
		},

		"snippets/delete": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const snippet = await requireSnippet(ctx, requireId(ctx));
				await cols(ctx).snippets.delete(snippet.id);
				await afterWrite(ctx, "delete", snippet);
				return { deleted: true };
			},
		},

		"killswitch/set": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => {
				const disabled = body(ctx).disabled;
				if (typeof disabled !== "boolean") throw PluginRouteError.badRequest("disabled must be true or false");
				const state = await afterWrite(ctx, disabled ? "killswitch_on" : "killswitch_off", null, { disabled });
				return { disabled: state.disabled };
			},
		},

		"changelog/list": {
			permission: "plugins:manage",
			handler: async (ctx: Ctx) => ({ entries: await listLog(cols(ctx).changelog) }),
		},
	} satisfies Record<string, PluginRoute>;

	return routes;
}
