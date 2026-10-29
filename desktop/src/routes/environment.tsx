import { Alert } from "@ckdry/ui/components/alert";
import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { Loading } from "@ckdry/ui/components/loading";
import { StatusDot } from "@ckdry/ui/components/status-dot";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { ActivityList } from "@/components/activity/activity-list";
import { ClusterCard } from "@/components/environment/cluster-card";
import { IssuesPanel } from "@/components/environment/issues-panel";
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

/** Live view of what ckdry runs: Docker, the clusters, what it is doing. */
export function EnvironmentRoute() {
	const env = useEnvironment(s => s.env);
	const error = useEnvironment(s => s.error);
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
	if (!env) return <Loading fill label="Reading the environment…" />;

	return (
		<div className="mx-auto flex h-full max-w-2xl flex-col gap-3 overflow-auto p-3">
			<header className="flex items-center justify-between">
				<strong>ckdry</strong>
				<DockerStatus docker={env.docker} />
			</header>
			<IssuesPanel issues={env.issues} />
			{error && <Alert variant="destructive">{error}</Alert>}
			{env.clusters.length === 0 && (
				<p className="text-muted-foreground text-sm">
					No clusters: an exam makes the ones it needs when it starts.
				</p>
			)}
			{env.clusters.map(cluster => (
				<ClusterCard key={cluster.name} cluster={cluster} />
			))}
			<section id="activity" className="flex flex-col gap-2">
				<h2 className="font-semibold text-sm">Activity</h2>
				<ActivityList />
			</section>
		</div>
	);
}
