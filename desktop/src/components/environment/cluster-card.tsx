import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { StatusDot } from "@ckpro/ui/components/status-dot";
import { nodeStatus } from "@/components/environment/node-status";
import { useEnvironment } from "@/stores/environment";
import type { ClusterState } from "@/tauri/api";

export function ClusterCard({ cluster }: { cluster: ClusterState }) {
	const job = useEnvironment(s => s.job);
	const runJob = useEnvironment(s => s.runJob);
	const busy = job !== null;
	const needsRepair = cluster.nodes.some(n => n.container.state !== "running");
	const workers = cluster.nodes.length - 1;

	return (
		<Card padding="sm">
			<header className="mb-2 flex items-center gap-2">
				<strong className="text-sm">{cluster.name}</strong>
				<span className="text-muted-foreground text-xs">
					1 control plane, {workers} worker{workers === 1 ? "" : "s"}
				</span>
				<div className="ml-auto flex gap-1.5">
					{needsRepair && (
						<Button
							size="sm"
							variant="pushDefault"
							disabled={busy}
							onClick={() => runJob("repair", cluster.name)}
						>
							Repair
						</Button>
					)}
					<ConfirmDialog
						title={`Delete ${cluster.name}?`}
						description="Its nodes and everything on them are removed."
						action="Delete"
						onConfirm={() => runJob("delete", cluster.name)}
					>
						<Button size="sm" variant="outline" disabled={busy}>
							{job?.cluster === cluster.name && job.action === "delete" ? "Deleting…" : "Delete"}
						</Button>
					</ConfirmDialog>
				</div>
			</header>
			<ul className="flex flex-col">
				{cluster.nodes.map(node => {
					const status = nodeStatus(node);
					return (
						<li key={node.name} className="flex items-center gap-2 py-1 text-sm">
							<StatusDot tone={status.tone} />
							<span className="select-text font-mono">{node.name}</span>
							<span className="text-muted-foreground text-xs">
								{node.role === "control_plane" ? "control plane" : "worker"} · {status.label}
							</span>
						</li>
					);
				})}
			</ul>
		</Card>
	);
}
