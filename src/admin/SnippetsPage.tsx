import {
	Badge,
	Banner,
	Button,
	Dialog,
	LayerCard,
	Loader,
	Switch,
	Tabs,
	Toasty,
	useKumoToastManager,
} from "@cloudflare/kumo";
import * as React from "react";
import { emptyDraft } from "../core/fields.js";
import { api, type ListResponse } from "./api.js";
import { ChangeLog } from "./ChangeLog.js";
import { InfoIcon, PlusIcon, WarningIcon } from "./icons.js";
import { type Draft, SnippetForm } from "./SnippetForm.js";
import { SnippetList } from "./SnippetList.js";
import { HfcStyles } from "./styles.js";

type View = { kind: "list" } | { kind: "edit"; draft: Draft };
type Tab = "snippets" | "changelog";
type Notify = (title: string, variant?: "success" | "error") => void;

/** True when an ancestor (the EmDash admin shell) already provides Kumo's toast manager. */
function useHasToastProvider(): boolean {
	// Deliberate try/catch around a hook: Kumo's useKumoToastManager reads its context and throws
	// when there is no provider. The hook is called on every render either way, so hook order is
	// stable; we only use the throw as a "no provider here" signal.
	try {
		useKumoToastManager();
		return true;
	} catch {
		return false;
	}
}

function useNotify(): Notify {
	const toasts = useKumoToastManager();
	return React.useCallback<Notify>((title, variant = "success") => toasts.add({ title, variant }), [toasts]);
}

/**
 * EmDash's admin wraps pages in Kumo's <Toasty>. If this page ever renders where that provider is
 * a different Kumo instance (or missing), provide one locally instead of crashing.
 */
export function SnippetsPage() {
	const hasProvider = useHasToastProvider();
	const page = (
		<>
			<HfcStyles />
			<SnippetsScreen />
		</>
	);
	return hasProvider ? page : <Toasty>{page}</Toasty>;
}

function SnippetsScreen() {
	const notify = useNotify();
	const [tab, setTab] = React.useState<Tab>("snippets");
	const [view, setView] = React.useState<View>({ kind: "list" });
	const [data, setData] = React.useState<ListResponse | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [confirmKill, setConfirmKill] = React.useState(false);
	const [killPending, setKillPending] = React.useState(false);
	const [killError, setKillError] = React.useState<string | null>(null);

	const refresh = React.useCallback(() => {
		return api.list().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
	}, []);
	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	/** Run a mutation, report failures in the page banner, toast success, then reload the list. */
	async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
		setError(null);
		let ok = false;
		try {
			await action();
			ok = true;
			if (success) notify(success);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
		await refresh();
		return ok;
	}

	async function openEditor(id: string) {
		setError(null);
		try {
			const { snippet } = await api.get(id);
			setView({ kind: "edit", draft: snippet });
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}

	/** Turning output off happens from the confirm Dialog, so its failure is shown there. */
	async function setOutput(enabled: boolean) {
		setKillPending(true);
		setKillError(null);
		setError(null);
		try {
			await api.setKillSwitch(!enabled);
			notify(enabled ? "Snippet output turned on" : "All snippet output turned off");
			setConfirmKill(false);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			if (enabled) setError(message);
			else setKillError(message);
		} finally {
			setKillPending(false);
			await refresh();
		}
	}

	function closeKillDialog() {
		setConfirmKill(false);
		setKillError(null);
	}

	if (view.kind === "edit") {
		return (
			<SnippetForm
				key={view.draft.id ?? "new"}
				initial={view.draft}
				onClose={() => setView({ kind: "list" })}
				onSaved={() => {
					notify("Snippet saved");
					setView({ kind: "list" });
					void refresh();
				}}
			/>
		);
	}

	const canManage = data?.canManage ?? false;
	const snippetIds = new Set(data?.snippets.map((s) => s.id) ?? []);
	const list = data ? (
		<SnippetList
			snippets={data.snippets}
			canManage={canManage}
			onNew={() => setView({ kind: "edit", draft: emptyDraft() })}
			onToggle={(id, enabled) => void run(() => api.toggle(id, enabled))}
			onEdit={(id) => void openEditor(id)}
			onDuplicate={(id) => void run(() => api.duplicate(id), "Snippet duplicated")}
			onDelete={async (id) => {
				await run(() => api.remove(id), "Snippet deleted");
			}}
		/>
	) : (
		<div className="flex justify-center py-10">
			<Loader />
		</div>
	);

	return (
		<div className="space-y-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-2xl font-semibold leading-tight">Header &amp; Footer Code</h1>
					<p className="text-sm text-kumo-subtle">
						Add analytics, verification tags and other snippets to your pages without editing the theme.
					</p>
				</div>
				{canManage && data && (
					<div className="flex flex-wrap items-center gap-4">
						<Switch
							data-testid="hfc-killswitch"
							checked={!data.disabled}
							disabled={killPending}
							onCheckedChange={(on: boolean) => (on ? void setOutput(true) : setConfirmKill(true))}
							label="Output enabled"
						/>
						<Button
							variant="primary"
							icon={<PlusIcon />}
							data-testid="hfc-new"
							onClick={() => setView({ kind: "edit", draft: emptyDraft() })}
						>
							New snippet
						</Button>
					</div>
				)}
			</header>

			<div className="space-y-3">
				<Banner
					data-testid="hfc-theme-note"
					icon={<InfoIcon size={20} />}
					title="Your theme must include the EmDash page components"
					description={
						<>
							Snippets only render if the layout includes <code>&lt;EmDashHead /&gt;</code>,{" "}
							<code>&lt;EmDashBodyStart /&gt;</code> and <code>&lt;EmDashBodyEnd /&gt;</code> for the matching
							placements. Pages served from an edge HTML cache show changes only after the cache is purged.
						</>
					}
				/>
				{data?.disabled && (
					<Banner
						variant="error"
						data-testid="hfc-disabled-banner"
						icon={<WarningIcon size={20} />}
						title="All snippet output is disabled"
						description="No snippet renders on any page until output is turned back on."
					/>
				)}
				{error && <Banner variant="error" title="Something went wrong" description={error} />}
			</div>

			{canManage ? (
				<div className="space-y-4">
					<Tabs
						className="hfc-tabs w-full max-w-full sm:w-fit"
						listClassName="w-full"
						indicatorClassName="hfc-tab-indicator"
						value={tab}
						onValueChange={(v) => setTab(v === "changelog" ? "changelog" : "snippets")}
						tabs={[
							{
								value: "snippets",
								className: "hfc-tab",
								label: (
									<span data-testid="hfc-tab-snippets" className="flex items-center gap-1.5">
										Snippets
										<Badge variant="secondary" className="hfc-tab-count">
											{data?.snippets.length ?? 0}
										</Badge>
									</span>
								),
							},
							{
								value: "changelog",
								className: "hfc-tab",
								label: <span data-testid="hfc-tab-changelog">Change log</span>,
							},
						]}
					/>
					<LayerCard>
						{tab === "changelog" ? <ChangeLog snippetIds={snippetIds} onOpen={(id) => void openEditor(id)} /> : list}
					</LayerCard>
				</div>
			) : (
				<LayerCard>{list}</LayerCard>
			)}

			<Dialog.Root role="alertdialog" open={confirmKill} onOpenChange={(o) => !o && !killPending && closeKillDialog()}>
				<Dialog className="max-w-md p-6" size="sm">
					<Dialog.Title className="text-lg font-semibold">Turn off all snippet output?</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle">
						Every snippet stops rendering on every page, whether it is enabled or not, until you turn output back on.
					</Dialog.Description>
					{killError && (
						<Banner
							variant="error"
							className="mt-4"
							data-testid="hfc-killswitch-error"
							title="Output was not turned off"
							description={killError}
						/>
					)}
					<div className="mt-6 flex justify-end gap-2">
						<Button variant="secondary" disabled={killPending} onClick={closeKillDialog}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							data-testid="hfc-confirm-killswitch"
							loading={killPending}
							onClick={() => void setOutput(false)}
						>
							Turn off output
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
