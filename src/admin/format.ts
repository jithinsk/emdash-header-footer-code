import type { ChangeLogAction, PageKind, Placement, UserRef } from "../core/types.js";

/** Pure display helpers for the admin page (no React, no DOM), unit-tested in node. */

export const PLACEMENT_LABEL: Record<Placement, string> = {
	head: "Head",
	"body:start": "Body start",
	"body:end": "Body end",
};

const PAGE_KIND_SUMMARY: Record<Exclude<PageKind, "all">, string> = {
	content: "content pages",
	custom: "custom pages",
};

export interface WhereFields {
	placement: Placement;
	includePaths: readonly string[];
	excludePaths: readonly string[];
	pageKind: PageKind;
	locales: readonly string[];
}

/** One-line "where does this render" summary, e.g. `Head · /blog/* · excl. /blog/draft-* · content pages · en`. */
export function whereSummary(s: WhereFields): string {
	const parts = [PLACEMENT_LABEL[s.placement] ?? s.placement];
	parts.push(s.includePaths.length > 0 ? s.includePaths.join(", ") : "All pages");
	if (s.excludePaths.length > 0) parts.push(`excl. ${s.excludePaths.join(", ")}`);
	if (s.pageKind !== "all") parts.push(PAGE_KIND_SUMMARY[s.pageKind] ?? s.pageKind);
	if (s.locales.length > 0) parts.push(s.locales.join(", "));
	return parts.join(" · ");
}

function startOfDay(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * "just now", "3 min ago", "2 hours ago" (same day), "yesterday", then a short date.
 * `now` is injectable for tests; `locale` defaults to the browser's.
 */
export function relativeTime(iso: string, now: Date | number = Date.now(), locale?: string): string {
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return iso;
	const nowDate = typeof now === "number" ? new Date(now) : now;
	const seconds = Math.floor((nowDate.getTime() - then.getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const dayDiff = Math.round((startOfDay(nowDate) - startOfDay(then)) / 86_400_000);
	if (dayDiff === 0) {
		const hours = Math.floor(minutes / 60);
		return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
	}
	if (dayDiff === 1) return "yesterday";
	const sameYear = then.getFullYear() === nowDate.getFullYear();
	return then.toLocaleDateString(locale, sameYear ? { month: "short", day: "numeric" } : { dateStyle: "medium" });
}

/** Full local timestamp for tooltips, e.g. "Oct 5, 2026, 3:04 PM". */
export function formatTimestamp(iso: string, locale?: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function userLabel(u: UserRef): string {
	return u.name ?? u.email ?? u.id;
}

export type ActionBadgeVariant = "success" | "info" | "secondary" | "error" | "warning";

/** Change-log action label and Kumo Badge variant. */
export const ACTION_META: Record<ChangeLogAction, { label: string; variant: ActionBadgeVariant }> = {
	create: { label: "Created", variant: "success" },
	update: { label: "Edited", variant: "info" },
	enable: { label: "Enabled", variant: "success" },
	disable: { label: "Disabled", variant: "secondary" },
	duplicate: { label: "Duplicated", variant: "info" },
	delete: { label: "Deleted", variant: "error" },
	killswitch_on: { label: "Output off", variant: "warning" },
	killswitch_off: { label: "Output on", variant: "success" },
};

export type PlacementFilter = Placement | "all";

/** Client-side list filter: case-insensitive name search plus a placement filter. Keeps order. */
export function filterSnippets<T extends { name: string; placement: Placement }>(
	list: readonly T[],
	f: { query: string; placement: PlacementFilter },
): T[] {
	const q = f.query.trim().toLowerCase();
	return list.filter(
		(s) => (f.placement === "all" || s.placement === f.placement) && (q === "" || s.name.toLowerCase().includes(q)),
	);
}
