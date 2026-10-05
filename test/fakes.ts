import type { KVAccess, StorageCollection } from "emdash";
import type { Logger, PageInfo, Snippet } from "../src/core/types.js";

// emdash does not export QueryOptions from its entry point.
type QueryOptions = NonNullable<Parameters<StorageCollection<object>["query"]>[0]>;

let seq = 0;
export function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
	seq += 1;
	const user = { id: "u1", name: "Admin", email: "admin@example.com" };
	return {
		id: `s${seq}`,
		schemaVersion: 1,
		name: `Snippet ${seq}`,
		code: `<!-- snippet ${seq} -->`,
		placement: "head",
		enabled: true,
		priority: 10,
		includePaths: [],
		excludePaths: [],
		pageKind: "all",
		locales: [],
		meta: {},
		createdAt: new Date(Date.UTC(2026, 9, 5, 0, 0, seq)).toISOString(),
		updatedAt: new Date(Date.UTC(2026, 9, 5, 0, 0, seq)).toISOString(),
		createdBy: user,
		updatedBy: user,
		...overrides,
	};
}

export function makePage(overrides: Partial<PageInfo> = {}): PageInfo {
	return {
		url: "https://example.com/",
		path: "/",
		locale: null,
		kind: "custom",
		pageType: "home",
		title: null,
		description: null,
		canonical: null,
		image: null,
		...overrides,
	};
}

export function makeLogger() {
	const warns: unknown[][] = [];
	const errors: unknown[][] = [];
	const log: Logger & { warns: unknown[][]; errors: unknown[][] } = {
		warns,
		errors,
		warn: (...args: unknown[]) => void warns.push(args),
		error: (...args: unknown[]) => void errors.push(args),
	};
	return log;
}

/** Minimal in-memory StorageCollection: get/put/delete/query (single-field orderBy), counts calls. */
export function memoryCollection<T extends object>() {
	const rows = new Map<string, T>();
	const calls = { get: 0, put: 0, delete: 0, query: 0 };
	const c = {
		rows,
		calls,
		async get(id: string) {
			calls.get++;
			return rows.get(id) ?? null;
		},
		async put(id: string, data: T) {
			calls.put++;
			rows.set(id, structuredClone(data));
		},
		async delete(id: string) {
			calls.delete++;
			return rows.delete(id);
		},
		async query(opts: QueryOptions = {}) {
			calls.query++;
			let items = [...rows.entries()].map(([id, data]) => ({ id, data: structuredClone(data) }));
			const [field, dir] = Object.entries(opts.orderBy ?? {})[0] ?? [];
			if (field) {
				items.sort((a, b) => {
					const av = String((a.data as Record<string, unknown>)[field]);
					const bv = String((b.data as Record<string, unknown>)[field]);
					return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === "desc" ? -1 : 1);
				});
			}
			const limit = Math.min(opts.limit ?? 50, 100);
			return { items: items.slice(0, limit), hasMore: items.length > limit };
		},
	};
	return c as typeof c & StorageCollection<T>;
}

/** Minimal in-memory KVAccess with versioned compare-and-set. */
export function memoryKV() {
	const store = new Map<string, { value: unknown; revision: number }>();
	const calls = { get: 0, getVersioned: 0, compareAndSet: 0, set: 0 };
	let failNextCas = 0;
	const kv = {
		store,
		calls,
		/** Make the next n compareAndSet calls report a conflict. */
		failCas(n: number) {
			failNextCas = n;
		},
		async get<T>(key: string) {
			calls.get++;
			return (store.get(key)?.value as T) ?? null;
		},
		async getVersioned<T>(key: string) {
			calls.getVersioned++;
			const e = store.get(key);
			return e ? { value: structuredClone(e.value) as T, revision: String(e.revision) } : null;
		},
		async compareAndSet(key: string, expected: string | null, value: unknown) {
			calls.compareAndSet++;
			if (failNextCas > 0) {
				failNextCas--;
				return { applied: false as const };
			}
			const e = store.get(key);
			const current = e ? String(e.revision) : null;
			if (current !== expected) return { applied: false as const };
			const revision = (e?.revision ?? 0) + 1;
			store.set(key, { value: structuredClone(value), revision });
			return { applied: true as const, revision: String(revision) };
		},
		async set(key: string, value: unknown) {
			calls.set++;
			store.set(key, { value: structuredClone(value), revision: (store.get(key)?.revision ?? 0) + 1 });
		},
	};
	return kv as typeof kv & KVAccess;
}
