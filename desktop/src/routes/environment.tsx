import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { ActivityList } from "@/components/activity/activity-list";
import { ClusterCard } from "@/components/environment/cluster-card";
import { CreateClusterForm } from "@/components/environment/create-cluster-form";
import { ForeignClusters } from "@/components/environment/foreign-clusters";
import { IssuesPanel } from "@/components/environment/issues-panel";
import { ScriptCard } from "@/components/environment/script-card";
import { StatusDot } from "@/components/environment/status-dot";
import { TerminalView } from "@/components/terminal/terminal-view";
import { useEnvironment } from "@/stores/environment";
import { type EnvState, envApi } from "@/tauri/api";

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
				<span className="flex items-center gap-2">
					<Badge>
						<StatusDot tone="error" /> Docker down
					</Badge>
					<Button size="push" variant="push" onClick={() => envApi.retry()}>
						Retry now
					</Button>
				</span>
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
	// Node readiness is shown here only: its watches stay open while the page does
	useEffect(() => {
		envApi.watchNodes(true);
		return () => {
			envApi.watchNodes(false);
		};
	}, []);
	// "All activity" from the top bar
	const { hash } = useLocation();
	useEffect(() => {
		if (hash === "#activity")
			document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" });
	}, [hash]);
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
				<section id="activity" className="flex flex-col gap-2">
					<h2 className="font-semibold text-sm">Activity</h2>
					<ActivityList />
				</section>
			</div>
			<Card padding="none" className="flex min-w-0 flex-1 flex-col p-2">
				<h2 className="mb-1 flex items-center gap-2 px-1 font-semibold text-sm">
					{shell ? `Shell on ${shell.node ?? "jumphost"}` : "Terminal"}
					<Button size="sm" variant="outline" className="ml-auto" onClick={() => openShell(null)}>
						Open jumphost
					</Button>
				</h2>
				<div className="min-h-0 flex-1">
					{shell && <TerminalView container={shell.node} session={shell.session} />}
				</div>
			</Card>
		</div>
	);
}
