import { Alert } from "@cktry/ui/components/alert";
import { Badge } from "@cktry/ui/components/badge";
import { Button } from "@cktry/ui/components/button";
import { Loading } from "@cktry/ui/components/loading";
import { SectionTitle } from "@cktry/ui/components/section-title";
import { StatusDot } from "@cktry/ui/components/status-dot";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { ActivityList } from "@/components/activity/activity-list";
import { ClusterCard } from "@/components/environment/cluster-card";
import { IssuesPanel } from "@/components/environment/issues-panel";
import { Screen } from "@/components/shell/screen";
import { useEnvironment } from "@/stores/environment";
import { type EnvState, envApi } from "@/tauri/api";
import { gb, plural } from "@/words";

function DockerStatus({ docker }: { docker: EnvState["docker"] }) {
	switch (docker.state) {
		case "up":
			return (
				<Badge variant="success">
					<StatusDot tone="ok" /> Docker {docker.version}, {plural(docker.cpus, "CPU")},{" "}
					{gb(docker.memory_mb)}
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

/** Live view of what cktry runs: Docker, the clusters, what it is doing. */
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
	if (!env) return <Loading fill label="Loading the environment…" />;

	return (
		<Screen title="Environment" actions={<DockerStatus docker={env.docker} />} className="gap-3">
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
				<SectionTitle>Activity</SectionTitle>
				<ActivityList />
			</section>
		</Screen>
	);
}
