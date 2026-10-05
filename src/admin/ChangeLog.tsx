import * as React from "react";
import type { ChangeLogEntry } from "../core/types.js";
import { api } from "./api.js";

const ACTION_LABEL: Record<ChangeLogEntry["action"], string> = {
	create: "Created",
	update: "Edited",
	enable: "Enabled",
	disable: "Disabled",
	duplicate: "Duplicated",
	delete: "Deleted",
	killswitch_on: "Turned all output off",
	killswitch_off: "Turned all output on",
};

export function ChangeLog() {
	const [entries, setEntries] = React.useState<ChangeLogEntry[] | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	React.useEffect(() => {
		api.changelog().then((r) => setEntries(r.entries), (e) => setError(String(e.message ?? e)));
	}, []);
	if (error) return <p className="text-kumo-danger text-sm">{error}</p>;
	if (!entries) return <p className="text-sm">Loading…</p>;
	if (entries.length === 0) return <p className="text-sm text-kumo-subtle">No changes yet.</p>;
	return (
		<table className="w-full text-sm">
			<thead>
				<tr className="text-left text-kumo-subtle">
					<th className="py-2">When</th>
					<th>Who</th>
					<th>Action</th>
					<th>Snippet</th>
				</tr>
			</thead>
			<tbody>
				{entries.map((e) => (
					<tr key={e.id} data-testid="hfc-changelog-row" className="border-t border-kumo-line">
						<td className="py-2">{new Date(e.at).toLocaleString()}</td>
						<td>{e.user.name ?? e.user.email ?? e.user.id}</td>
						<td>{ACTION_LABEL[e.action]}</td>
						<td>{e.snippetName ?? "—"}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
