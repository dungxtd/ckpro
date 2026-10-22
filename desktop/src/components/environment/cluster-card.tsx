import { Button } from "@ckiu/ui/components/button";
import { SquareTerminal } from "lucide-react";
import { useEnvironment } from "@/stores/environment";
import type { ClusterState } from "@/tauri/api";
import { nodeStatus, StatusDot } from "./status-dot";

export function ClusterCard({
	cluster,
	onShell,
}: {
	cluster: ClusterState;
	onShell: (node: string) => void;
}) {
	const job = useEnvironment(s => s.job);
	const runJob = useEnvironment(s => s.runJob);
	const busy = job !== null;
	const needsRepair = cluster.nodes.some(n => n.container.state !== "running");

	return (
		<section className="rounded-lg border border-border bg-card p-3">
			<header className="mb-2 flex items-center gap-2">
				<strong className="text-sm">{cluster.name}</strong>
				<span className="text-muted-foreground text-xs">
					1 control plane, {cluster.nodes.length - 1} workers
				</span>
				<div className="ml-auto flex gap-1.5">
					{needsRepair && (
						<Button size="sm" disabled={busy} onClick={() => runJob("repair", cluster.name)}>
							Repair
						</Button>
					)}
					<Button
						size="sm"
						variant="outline"
						disabled={busy}
						onClick={() => runJob("delete", cluster.name)}
					>
						{job?.cluster === cluster.name && job.action === "delete" ? "Deleting…" : "Delete"}
					</Button>
				</div>
			</header>
			<ul className="flex flex-col">
				{cluster.nodes.map(node => {
					const status = nodeStatus(node);
					return (
						<li key={node.name} className="flex items-center gap-2 py-1 text-sm">
							<StatusDot tone={status.tone} />
							<span className="font-mono">{node.name}</span>
							<span className="text-muted-foreground text-xs">
								{node.role === "control_plane" ? "control plane" : "worker"} · {status.label}
							</span>
							<Button
								size="sm"
								variant="ghost"
								className="ml-auto"
								disabled={node.container.state !== "running"}
								onClick={() => onShell(node.name)}
							>
								<SquareTerminal className="size-4" /> Shell
							</Button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
