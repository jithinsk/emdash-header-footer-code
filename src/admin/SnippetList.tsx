import { Badge, Button, Dialog, DropdownMenu, Empty, Input, Select, Switch, Table, cn } from "@cloudflare/kumo";
import * as React from "react";
import { PLACEMENTS } from "../core/types.js";
import type { SnippetSummary } from "./api.js";
import {
	PLACEMENT_LABEL,
	type PlacementFilter,
	filterSnippets,
	formatTimestamp,
	relativeTime,
	userLabel,
	whereSummary,
} from "./format.js";
import { CodeIcon, CopyIcon, DotsIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "./icons.js";

const FILTER_ITEMS: Record<PlacementFilter, string> = {
	all: "All placements",
	...Object.fromEntries(PLACEMENTS.map((p) => [p, PLACEMENT_LABEL[p]])),
} as Record<PlacementFilter, string>;

/** Clicks on these (or inside them) never open the row's editor. */
const INTERACTIVE = "button, a, input, label, select, textarea, [role='switch'], [role='menuitem']";

/** Re-render every minute so relative times stay current. */
function useNow(): number {
	const [now, setNow] = React.useState(() => Date.now());
	React.useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(t);
	}, []);
	return now;
}

export function SnippetList(props: {
	snippets: SnippetSummary[];
	canManage: boolean;
	onNew: () => void;
	onToggle: (id: string, enabled: boolean) => void;
	onEdit: (id: string) => void;
	onDuplicate: (id: string) => void;
	onDelete: (id: string) => Promise<void>;
}) {
	const { snippets, canManage } = props;
	const now = useNow();
	const [query, setQuery] = React.useState("");
	const [placement, setPlacement] = React.useState<PlacementFilter>("all");
	const [confirming, setConfirming] = React.useState<SnippetSummary | null>(null);
	const [deleting, setDeleting] = React.useState(false);

	const visible = filterSnippets(snippets, { query, placement });

	async function confirmDelete() {
		if (!confirming) return;
		setDeleting(true);
		try {
			await props.onDelete(confirming.id);
		} finally {
			setDeleting(false);
			setConfirming(null);
		}
	}

	if (snippets.length === 0) {
		return (
			<Empty
				icon={<CodeIcon size={40} className="text-kumo-subtle" />}
				title="No snippets yet"
				description={
					canManage
						? "Add analytics, verification tags, chat widgets or custom CSS and JavaScript to your pages."
						: "An administrator hasn't added any snippets."
				}
				contents={
					canManage ? (
						<Button variant="primary" icon={<PlusIcon />} onClick={props.onNew}>
							New snippet
						</Button>
					) : undefined
				}
			/>
		);
	}

	return (
		<>
			<div className="flex flex-col gap-3 border-b border-kumo-line p-4 sm:flex-row sm:items-center">
				<div className="relative w-full sm:w-72">
					<span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-kumo-subtle">
						<SearchIcon />
					</span>
					<Input
						type="search"
						data-testid="hfc-search"
						aria-label="Search snippets by name"
						placeholder="Search by name…"
						className="w-full ps-9"
						value={query}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
					/>
				</div>
				<div data-testid="hfc-filter-placement" className="w-full sm:w-48">
					<Select
						aria-label="Filter by placement"
						className="w-full"
						value={placement}
						onValueChange={(v) => setPlacement((v as PlacementFilter | null) ?? "all")}
						items={FILTER_ITEMS}
					/>
				</div>
				<p className="whitespace-nowrap text-sm text-kumo-subtle sm:ms-auto">
					{visible.length === snippets.length
						? `${snippets.length} ${snippets.length === 1 ? "snippet" : "snippets"}`
						: `${visible.length} of ${snippets.length}`}
				</p>
			</div>

			{visible.length === 0 ? (
				<Empty
					size="sm"
					icon={<SearchIcon size={32} className="text-kumo-subtle" />}
					title="No matches"
					description="No snippets match your search or filter."
					contents={
						<Button
							variant="secondary"
							onClick={() => {
								setQuery("");
								setPlacement("all");
							}}
						>
							Clear filters
						</Button>
					}
				/>
			) : (
				<div className="overflow-x-auto">
					<Table>
						<Table.Header>
							<Table.Row>
								<Table.Head>Name</Table.Head>
								<Table.Head>Placement</Table.Head>
								<Table.Head>Priority</Table.Head>
								<Table.Head>Enabled</Table.Head>
								<Table.Head>Updated</Table.Head>
								{canManage && (
									<Table.Head>
										<span className="sr-only">Actions</span>
									</Table.Head>
								)}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{visible.map((s) => (
								<Table.Row
									key={s.id}
									data-testid={`hfc-row-${s.id}`}
									className={cn(canManage && "hfc-row-clickable", !s.enabled && "hfc-row-off")}
									onClick={
										canManage
											? (e: React.MouseEvent<HTMLTableRowElement>) => {
													const target = e.target as Element;
													// Portaled menus bubble React events here too; only real in-row clicks count.
													if (!e.currentTarget.contains(target) || target.closest(INTERACTIVE)) return;
													props.onEdit(s.id);
												}
											: undefined
									}
								>
									<Table.Cell className="hfc-dim">
										<div className="font-medium text-kumo-default">{s.name}</div>
										<div className="hfc-where truncate text-sm text-kumo-subtle" title={whereSummary(s)}>
											{whereSummary(s)}
										</div>
									</Table.Cell>
									<Table.Cell className="hfc-dim">
										<Badge variant="secondary">{PLACEMENT_LABEL[s.placement]}</Badge>
									</Table.Cell>
									<Table.Cell className="hfc-dim tabular-nums">{s.priority}</Table.Cell>
									<Table.Cell>
										{canManage ? (
											<Switch
												size="sm"
												data-testid={`hfc-row-toggle-${s.id}`}
												checked={s.enabled}
												onCheckedChange={(v: boolean) => props.onToggle(s.id, v)}
												label={s.enabled ? "On" : "Off"}
												aria-label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
											/>
										) : (
											<Badge variant={s.enabled ? "success" : "secondary"}>{s.enabled ? "On" : "Off"}</Badge>
										)}
									</Table.Cell>
									<Table.Cell className="hfc-dim whitespace-nowrap">
										<div className="text-sm text-kumo-default" title={formatTimestamp(s.updatedAt)}>
											{relativeTime(s.updatedAt, now)}
										</div>
										<div className="text-sm text-kumo-subtle">{userLabel(s.updatedBy)}</div>
									</Table.Cell>
									{canManage && (
										<Table.Cell>
											<div className="flex items-center justify-end gap-1">
												<Button
													variant="secondary"
													size="sm"
													icon={<PencilIcon size={14} />}
													data-testid={`hfc-row-edit-${s.id}`}
													onClick={() => props.onEdit(s.id)}
												>
													Edit
												</Button>
												<DropdownMenu>
													<DropdownMenu.Trigger
														render={
															<Button
																variant="ghost"
																size="sm"
																shape="square"
																icon={<DotsIcon />}
																aria-label={`More actions for ${s.name}`}
																data-testid={`hfc-row-menu-${s.id}`}
															/>
														}
													/>
													<DropdownMenu.Content align="end">
														<DropdownMenu.Item
															icon={<CopyIcon size={14} className="me-2" />}
															data-testid={`hfc-row-duplicate-${s.id}`}
															onClick={() => props.onDuplicate(s.id)}
														>
															Duplicate
														</DropdownMenu.Item>
														<DropdownMenu.Separator />
														<DropdownMenu.Item
															variant="danger"
															icon={<TrashIcon size={14} className="me-2" />}
															data-testid={`hfc-row-delete-${s.id}`}
															onClick={() => setConfirming(s)}
														>
															Delete
														</DropdownMenu.Item>
													</DropdownMenu.Content>
												</DropdownMenu>
											</div>
										</Table.Cell>
									)}
								</Table.Row>
							))}
						</Table.Body>
					</Table>
				</div>
			)}

			<Dialog.Root
				role="alertdialog"
				open={confirming !== null}
				onOpenChange={(o) => !o && !deleting && setConfirming(null)}
			>
				<Dialog className="max-w-md p-6" size="sm">
					<Dialog.Title className="text-lg font-semibold">Delete snippet?</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle">
						“{confirming?.name}” will stop rendering on every page. This cannot be undone.
					</Dialog.Description>
					<div className="mt-6 flex justify-end gap-2">
						<Button variant="secondary" disabled={deleting} onClick={() => setConfirming(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							data-testid="hfc-confirm-delete"
							loading={deleting}
							onClick={() => void confirmDelete()}
						>
							Delete
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</>
	);
}
