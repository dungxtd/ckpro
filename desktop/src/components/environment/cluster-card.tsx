import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { nodeStatus } from "@/components/environment/node-status";
import { useEnvironment } from "@/stores/environment";
import type { ClusterState } from "@/tauri/api";
import type { ContainerUse } from "@/tauri/bindings";
import { plural } from "@/words";
import { Rows } from "./part-cards";
import { nodeMb, type Purpose } from "./usage";

const PURPOSE: Record<Purpose, string | null> = {
	exam: "Your exam",
	proof: "A Create proof: removed when it ends",
	other: null,
};

/** A cluster: what it is for, its nodes (health, memory), its version and
 * guard, and what can be done to it */
export function ClusterCard({
	cluster,
	purpose = "other",
	usage,
}: {
	cluster: ClusterState;
	purpose?: Purpose;
	usage?: ContainerUse[] | null;
}) {
	// What Rust is doing to it now (starting its nodes, or removing it), or
	// was just asked to
	const job = useEnvironment(s => s.env?.cluster_jobs?.[cluster.name]);
	const asked = useEnvironment(s => s.asked[cluster.name]);
	const runJob = useEnvironment(s => s.runJob);
	const busy = job !== undefined || asked !== undefined;
	const starting = job === "starting" || (!job && asked === "repair");
	const removing = job === "removing" || (!job && asked === "delete");
	const needsRepair = cluster.nodes.some(n => n.container.state !== "running");
	const workers = cluster.nodes.length - 1;
	const version = cluster.nodes.find(n => n.version)?.version;

	return (
		<Card padding="sm">
			<header className="mb-2 flex items-center gap-2">
				<strong className="min-w-0 select-text truncate text-sm">{cluster.name}</strong>
				<span className="min-w-0 truncate text-caption text-muted-foreground">
					{PURPOSE[purpose] && `${PURPOSE[purpose]} · `}1 control plane, {plural(workers, "worker")}
				</span>
				<div className="ml-auto flex shrink-0 gap-1.5">
					{needsRepair && (
						<Button
							size="push"
							variant="pushDefault"
							disabled={busy}
							onClick={() => runJob("repair", cluster.name)}
						>
							{starting ? "Starting…" : "Repair"}
						</Button>
					)}
					<ConfirmDialog
						title={`Delete ${cluster.name}?`}
						description="Its nodes and everything on them are removed."
						action="Delete"
						onConfirm={() => runJob("delete", cluster.name)}
					>
						<Button size="push" variant="push" disabled={busy}>
							{removing ? "Deleting…" : "Delete"}
						</Button>
					</ConfirmDialog>
				</div>
			</header>
			<Rows
				rows={cluster.nodes.map(node => {
					const status = nodeStatus(node);
					return {
						key: node.name,
						tone: status.tone,
						name: node.name,
						what: `${node.role === "control_plane" ? "control plane" : "worker"} · ${status.label}`,
						mb: nodeMb(usage, node.name),
					};
				})}
			/>
			{/* Measured facts only: the version the nodes run, and the guard */}
			<dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-border border-t pt-2 text-caption">
				<dt className="text-muted-foreground">Kubernetes</dt>
				<dd className="select-text">{version ?? "shown once its nodes answer"}</dd>
				<dt className="text-muted-foreground">Guard</dt>
				<dd>
					{cluster.guarded
						? "On: kubectl from this computer is blocked, and changes from outside are put back and noted"
						: "Off: on only while an exam runs on it"}
				</dd>
			</dl>
		</Card>
	);
}
