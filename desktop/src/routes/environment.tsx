import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { useState } from "react";
import { ClusterCard } from "@/components/environment/cluster-card";
import { CreateClusterForm } from "@/components/environment/create-cluster-form";
import { ForeignClusters } from "@/components/environment/foreign-clusters";
import { IssuesPanel } from "@/components/environment/issues-panel";
import { ScriptCard } from "@/components/environment/script-card";
import { StatusDot } from "@/components/environment/status-dot";
import { TerminalView } from "@/components/terminal/terminal-view";
import { useEnvironment } from "@/stores/environment";
import type { EnvState } from "@/tauri/api";

function DockerStatus({ docker }: { docker: EnvState["docker"] }) {
	switch (docker.state) {
		case "up":
			return (
				<Badge variant="success">
					<StatusDot tone="ok" /> Docker {docker.version} · {docker.cpus} CPU ·{" "}
					{(docker.memory_mb / 1024).toFixed(1)} GB
				</Badge>
			);
		case "down":
			return (
				<Badge>
					<StatusDot tone="error" /> Docker down
				</Badge>
			);
		default:
			return (
				<Badge>
					<StatusDot tone="warn" /> Connecting to Docker…
				</Badge>
			);
	}
}

/** Live view of everything ckdry runs, with the actions to fix it. */
export function EnvironmentRoute() {
	const env = useEnvironment(s => s.env);
	// null node: the jumphost, where the candidate works
	const [shell, setShell] = useState<{ node: string | null; session: number } | null>(null);
	const openShell = (node: string | null) =>
		setShell(s => ({ node, session: (s?.session ?? 0) + 1 }));
	if (!env) return null;

	return (
		<div className="flex h-full gap-3 p-3">
			<div className="flex w-[460px] shrink-0 flex-col gap-3 overflow-auto">
				<header className="flex items-center justify-between">
					<strong>ckdry</strong>
					<DockerStatus docker={env.docker} />
				</header>
				<IssuesPanel issues={env.issues} />
				{env.clusters.map(cluster => (
					<ClusterCard key={cluster.name} cluster={cluster} onShell={openShell} />
				))}
				<ForeignClusters names={env.foreign_clusters} />
				<CreateClusterForm />
				{env.clusters.length > 0 && <ScriptCard />}
			</div>
			<section className="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-card p-2">
				<h2 className="mb-1 flex items-center gap-2 px-1 font-semibold text-sm">
					{shell ? `Shell on ${shell.node ?? "jumphost"}` : "Terminal"}
					<Button size="sm" variant="outline" className="ml-auto" onClick={() => openShell(null)}>
						Open jumphost
					</Button>
				</h2>
				<div className="min-h-0 flex-1">
					{shell && <TerminalView container={shell.node} session={shell.session} />}
				</div>
			</section>
		</div>
	);
}
