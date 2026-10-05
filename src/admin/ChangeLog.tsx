import { Badge, Banner, Empty, Link, Loader, Table } from "@cloudflare/kumo";
import * as React from "react";
import type { ChangeLogEntry } from "../core/types.js";
import { api } from "./api.js";
import { ACTION_META, formatTimestamp, relativeTime, userLabel } from "./format.js";

export function ChangeLog({ snippetIds, onOpen }: { snippetIds: ReadonlySet<string>; onOpen: (id: string) => void }) {
	const [entries, setEntries] = React.useState<ChangeLogEntry[] | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [now] = React.useState(() => Date.now());

	React.useEffect(() => {
		api.changelog().then(
			(r) => setEntries(r.entries),
			(e: unknown) => setError(e instanceof Error ? e.message : String(e)),
		);
	}, []);

	if (error) {
		return (
			<div className="p-4">
				<Banner variant="error" title="Could not load the change log" description={error} />
			</div>
		);
	}
	if (!entries) {
		return (
			<div className="flex justify-center py-10">
				<Loader />
			</div>
		);
	}
	if (entries.length === 0) {
		return <Empty title="No changes yet" description="Creating, editing or deleting snippets is recorded here." />;
	}
	return (
		<div className="overflow-x-auto">
			<Table>
				<Table.Header>
					<Table.Row>
						<Table.Head>When</Table.Head>
						<Table.Head>Who</Table.Head>
						<Table.Head>Action</Table.Head>
						<Table.Head>Snippet</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{entries.map((e) => {
						const meta = ACTION_META[e.action];
						const canOpen = e.snippetId !== null && snippetIds.has(e.snippetId);
						return (
							<Table.Row key={e.id} data-testid="hfc-changelog-row">
								<Table.Cell className="whitespace-nowrap text-sm">
									<time dateTime={e.at} title={formatTimestamp(e.at)}>
										{relativeTime(e.at, now)}
									</time>
								</Table.Cell>
								<Table.Cell className="text-sm">{userLabel(e.user)}</Table.Cell>
								<Table.Cell>
									<Badge variant={meta?.variant ?? "secondary"}>{meta?.label ?? e.action}</Badge>
								</Table.Cell>
								<Table.Cell className="text-sm">
									{e.snippetName === null ? (
										<span className="text-kumo-subtle">—</span>
									) : canOpen ? (
										<Link
											variant="plain"
											render={<button type="button" className="cursor-pointer text-start" />}
											onClick={() => onOpen(e.snippetId!)}
										>
											{e.snippetName}
										</Link>
									) : (
										<span>{e.snippetName}</span>
									)}
								</Table.Cell>
							</Table.Row>
						);
					})}
				</Table.Body>
			</Table>
		</div>
	);
}
