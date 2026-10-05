import { Switch } from "@cloudflare/kumo";
import * as React from "react";
import type { SnippetSummary } from "./api.js";

const PLACEMENT_LABEL = { head: "Head", "body:start": "Body start", "body:end": "Body end" } as const;

export function SnippetList(props: {
	snippets: SnippetSummary[];
	canManage: boolean;
	onToggle: (id: string, enabled: boolean) => void;
	onEdit: (id: string) => void;
	onDuplicate: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	const [confirming, setConfirming] = React.useState<SnippetSummary | null>(null);
	if (props.snippets.length === 0) {
		return <p className="text-sm text-kumo-subtle">No snippets yet.</p>;
	}
	return (
		<>
			<table className="w-full text-sm">
				<thead>
					<tr className="text-left text-kumo-subtle">
						<th className="py-2">Name</th>
						<th>Placement</th>
						<th>Enabled</th>
						<th>Priority</th>
						<th>Last updated</th>
						{props.canManage && <th />}
					</tr>
				</thead>
				<tbody>
					{props.snippets.map((s) => (
						<tr key={s.id} data-testid={`hfc-row-${s.id}`} className="border-t border-kumo-line">
							<td className="py-2">{s.name}</td>
							<td>{PLACEMENT_LABEL[s.placement]}</td>
							<td>
								{props.canManage ? (
									<Switch
										data-testid={`hfc-row-toggle-${s.id}`}
										checked={s.enabled}
										onCheckedChange={(v: boolean) => props.onToggle(s.id, v)}
										label={s.enabled ? "On" : "Off"}
									/>
								) : s.enabled ? (
									"On"
								) : (
									"Off"
								)}
							</td>
							<td>{s.priority}</td>
							<td>
								{new Date(s.updatedAt).toLocaleString()}
								{s.updatedBy.name ? ` · ${s.updatedBy.name}` : ""}
							</td>
							{props.canManage && (
								<td className="space-x-2 text-right">
									<button data-testid={`hfc-row-edit-${s.id}`} type="button" onClick={() => props.onEdit(s.id)}>Edit</button>
									<button data-testid={`hfc-row-duplicate-${s.id}`} type="button" onClick={() => props.onDuplicate(s.id)}>Duplicate</button>
									<button data-testid={`hfc-row-delete-${s.id}`} type="button" className="text-kumo-danger" onClick={() => setConfirming(s)}>Delete</button>
								</td>
							)}
						</tr>
					))}
				</tbody>
			</table>
			{confirming && (
				<div role="dialog" aria-modal="true" className="fixed inset-0 flex items-center justify-center bg-black/40">
					<div className="rounded-lg bg-kumo-base p-6 space-y-4 max-w-sm">
						<p>Delete “{confirming.name}”? This cannot be undone.</p>
						<div className="flex gap-2 justify-end">
							<button type="button" onClick={() => setConfirming(null)}>Cancel</button>
							<button
								data-testid="hfc-confirm-delete"
								type="button"
								className="text-kumo-danger"
								onClick={() => {
									props.onDelete(confirming.id);
									setConfirming(null);
								}}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
