import type { PageFragmentContribution, PublicPageContext } from "emdash";

export const PLACEMENTS = ["head", "body:start", "body:end"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export const PAGE_KINDS = ["all", "content", "custom"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export interface UserRef {
	id: string;
	name: string | null;
	email: string | null;
}

/** Fields an admin edits. */
export interface EditableSnippet {
	name: string;
	code: string;
	placement: Placement;
	enabled: boolean;
	priority: number;
	includePaths: string[];
	excludePaths: string[];
	pageKind: PageKind;
	locales: string[];
	meta: Record<string, unknown>;
}

export interface Snippet extends EditableSnippet {
	id: string;
	schemaVersion: number; // 1 in v0.1
	createdAt: string; // ISO
	updatedAt: string; // ISO
	createdBy: UserRef;
	updatedBy: UserRef;
}

export interface PluginState {
	rev: number;
	disabled: boolean;
}
export const DEFAULT_STATE: PluginState = { rev: 0, disabled: false };

export type ChangeLogAction =
	| "create"
	| "update"
	| "enable"
	| "disable"
	| "duplicate"
	| "delete"
	| "killswitch_on"
	| "killswitch_off";

export interface ChangeLogEntry {
	id: string;
	at: string;
	user: UserRef;
	action: ChangeLogAction;
	snippetId: string | null;
	snippetName: string | null;
}

export type PageInfo = PublicPageContext;

export interface TransformContext {
	snippet: Readonly<Snippet>;
	html: string;
	page: Readonly<PageInfo>;
}
export type TransformResult =
	| string
	| null
	| { html: string | null; fragments?: PageFragmentContribution[] };
export type Transform = (ctx: TransformContext) => TransformResult;

export interface Logger {
	warn(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
}
