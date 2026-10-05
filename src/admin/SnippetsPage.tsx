import { Switch } from "@cloudflare/kumo";
import * as React from "react";
import { emptyDraft } from "../core/fields.js";
import type { EditableSnippet } from "../core/types.js";
import { api, type ListResponse } from "./api.js";
import { ChangeLog } from "./ChangeLog.js";
import { SnippetForm } from "./SnippetForm.js";
import { SnippetList } from "./SnippetList.js";

type View = { kind: "list" } | { kind: "edit"; draft: EditableSnippet & { id?: string } };

export function SnippetsPage() {
	const [tab, setTab] = React.useState<"snippets" | "changelog">("snippets");
	const [view, setView] = React.useState<View>({ kind: "list" });
	const [data, setData] = React.useState<ListResponse | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	const refresh = React.useCallback(() => {
		api.list().then(setData, (e) => setError(String(e.message ?? e)));
	}, []);
	React.useEffect(refresh, [refresh]);

	async function run(action: () => Promise<unknown>) {
		setError(null);
		try {
			await action();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
		refresh();
	}

	async function edit(id: string) {
		const { snippet } = await api.get(id);
		setView({ kind: "edit", draft: snippet });
	}

	async function setKillSwitch(outputEnabled: boolean) {
		if (!outputEnabled && !window.confirm("Turn off all snippet output on every page?")) return;
		await run(() => api.setKillSwitch(!outputEnabled));
	}

	return (
		<div className="space-y-6 p-6">
			<header className="space-y-3">
				<h1 className="text-2xl font-semibold">Header &amp; Footer Code</h1>
				<p data-testid="hfc-theme-note" className="rounded-md border border-kumo-line bg-kumo-tint p-3 text-sm">
					Snippets only render if your theme's layout includes <code>&lt;EmDashHead /&gt;</code>,{" "}
					<code>&lt;EmDashBodyStart /&gt;</code> and <code>&lt;EmDashBodyEnd /&gt;</code> for the matching
					placements. Pages served from an edge HTML cache show changes only after the cache is purged.
				</p>
				{data?.disabled && (
					<p data-testid="hfc-disabled-banner" className="rounded-md bg-kumo-danger p-3 text-sm font-semibold text-white">
						All snippet output is disabled.
					</p>
				)}
				{data?.canManage && (
					<Switch
						data-testid="hfc-killswitch"
						checked={!data.disabled}
						onCheckedChange={setKillSwitch}
						label="Output enabled"
					/>
				)}
				{error && <p className="text-kumo-danger text-sm">{error}</p>}
			</header>

			{view.kind === "edit" ? (
				<SnippetForm
					initial={view.draft}
					onDone={() => {
						setView({ kind: "list" });
						refresh();
					}}
				/>
			) : (
				<>
					<nav className="flex gap-4 border-b border-kumo-line">
						<button data-testid="hfc-tab-snippets" type="button" onClick={() => setTab("snippets")} aria-pressed={tab === "snippets"}>
							Snippets
						</button>
						{data?.canManage && (
							<button data-testid="hfc-tab-changelog" type="button" onClick={() => setTab("changelog")} aria-pressed={tab === "changelog"}>
								Change log
							</button>
						)}
					</nav>
					{tab === "changelog" ? (
						<ChangeLog />
					) : !data ? (
						<p className="text-sm">Loading…</p>
					) : (
						<div className="space-y-4">
							{data.canManage && (
								<button data-testid="hfc-new" type="button" onClick={() => setView({ kind: "edit", draft: emptyDraft() })} className="rounded-md bg-kumo-brand px-4 py-2 text-sm text-white">
									New snippet
								</button>
							)}
							<SnippetList
								snippets={data.snippets}
								canManage={data.canManage}
								onToggle={(id, enabled) => run(() => api.toggle(id, enabled))}
								onEdit={(id) => run(() => edit(id))}
								onDuplicate={(id) => run(() => api.duplicate(id))}
								onDelete={(id) => run(() => api.remove(id))}
							/>
						</div>
					)}
				</>
			)}
		</div>
	);
}
