import { Alert } from "@ckpro/ui/components/alert";
import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { Loading } from "@ckpro/ui/components/loading";
import { SectionTitle } from "@ckpro/ui/components/section-title";
import { StatusDot } from "@ckpro/ui/components/status-dot";
import { CircleCheck, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ActivityList } from "@/components/activity/activity-list";
import { ClusterCard } from "@/components/environment/cluster-card";
import { IssuesPanel } from "@/components/environment/issues-panel";
import { MemoryMap } from "@/components/environment/memory-map";
import { OtherAppsCard, ProofClusterCard, ServicesCard } from "@/components/environment/part-cards";
import { parts as partsOf, purpose } from "@/components/environment/usage";
import { Screen } from "@/components/shell/screen";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useTargets } from "@/stores/settings";
import { type EnvState, envApi } from "@/tauri/api";
import { memory, plural } from "@/words";

function DockerStatus({ docker }: { docker: EnvState["docker"] }) {
	switch (docker.state) {
		case "up":
			return (
				<Badge variant="success">
					<StatusDot tone="ok" /> Docker {docker.version}, {plural(docker.cpus, "CPU")},{" "}
					{memory(docker.memory_mb)}
				</Badge>
			);
		case "down":
			return (
				<span className="flex items-center gap-2">
					<Badge>
						<StatusDot tone="error" /> Docker down
					</Badge>
					<Button size="push" variant="push" onClick={() => envApi.retry()}>
						Try again
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

/** No attempt, no clusters of it (one array: a store selector must not make
 * a new one each time) */
const NO_CLUSTERS: string[] = [];

/** Live view of what ckpro runs: Docker's memory and what uses it, what
 * needs the candidate, each part in detail, what it is doing. */
export function EnvironmentRoute() {
	const env = useEnvironment(s => s.env);
	const examClusters = useExam(s =>
		s.state && "attempt" in s.state && s.state.attempt ? s.state.attempt.clusters : NO_CLUSTERS
	);
	const catalog = useExam(s => s.catalog);
	const loadCatalog = useExam(s => s.loadCatalog);
	// The exams aimed at: only theirs are weighed (all when none is)
	const aimed = useTargets().map(t => t.certification);
	// The part of the map whose details show (the first, until one is picked)
	const [picked, setPicked] = useState<string | null>(null);
	// Node readiness and what containers take are measured here only: while
	// the page is open
	useEffect(() => {
		envApi.watchNodes(true);
		return () => {
			envApi.watchNodes(false);
		};
	}, []);
	useEffect(() => {
		if (catalog.length === 0) loadCatalog();
	}, [catalog.length, loadCatalog]);
	// The top bar's chip: that activity, its log open. Taken once and cleared
	// from the history entry, so Back to it later leaves the list as it was
	const location = useLocation();
	const navigate = useNavigate();
	const asked = (location.state as { activity?: number } | null)?.activity;
	const [focus, setFocus] = useState<{ activity: number; key: string } | null>(null);
	useEffect(() => {
		if (asked === undefined) return;
		setFocus({ activity: asked, key: location.key });
		navigate(location.pathname, { replace: true, state: null });
	}, [asked, location.key, location.pathname, navigate]);
	if (!env) return <Loading fill label="Loading the environment…" />;

	const docker = env.docker;
	const missing = env.images_missing ?? [];
	const passed = env.passed ?? [];
	const usage = env.usage ?? null;
	const parts = usage
		? partsOf(
				usage,
				examClusters,
				env.clusters.map(c => c.name)
			)
		: [];
	const open = picked && parts.some(p => p.key === picked) ? picked : (parts[0]?.key ?? null);
	// An exam's comfortable need, of the certification aimed at (else any):
	// drawn beside the free room as an estimate
	const exams = catalog.filter(e => aimed.length === 0 || aimed.includes(e.certification));
	const largest = exams.reduce<(typeof exams)[number] | null>(
		(big, e) => (!big || e.memory_mb > big.memory_mb ? e : big),
		null
	);
	const estimate = largest && {
		what: `A ${largest.certification.toUpperCase()} exam`,
		mb: largest.memory_mb,
	};
	const cluster = env.clusters.find(c => c.name === open);

	return (
		<Screen title="Environment" actions={<DockerStatus docker={docker} />} className="gap-3">
			{docker.state === "up" &&
				(usage ? (
					<>
						<p className="text-sm">
							<strong className="tabular-nums">
								{memory(Math.max(0, docker.memory_mb - parts.reduce((n, p) => n + p.mb, 0)))} free
							</strong>{" "}
							<span className="text-muted-foreground">
								of the {memory(docker.memory_mb)} Docker has
								{docker.engine && `, on ${docker.engine}`}.
							</span>
						</p>
						<MemoryMap
							totalMb={docker.memory_mb}
							parts={parts}
							clusters={env.clusters}
							usage={usage}
							estimate={estimate}
							open={open}
							onOpen={setPicked}
						/>
					</>
				) : (
					<Loading label="Measuring what uses Docker's memory…" />
				))}

			{/* Needs you: what is wrong, and the images not here yet */}
			<IssuesPanel issues={env.issues} />
			{/* Being got: its activity (below, and in the title bar) shows it */}
			{docker.state === "up" && missing.length > 0 && !env.images_downloading && (
				<Alert variant="warning">
					<Download />
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<div>
							<div>
								{plural(missing.length, "exam image")} not downloaded: {missing.join(", ")}
							</div>
							<div className="text-caption text-muted-foreground">
								{/* Why the last try failed, and what can be done about it */}
								{env.images_unavailable ?? "Exams start sooner, and offline, once they are here"}
							</div>
						</div>
						<span className="flex gap-1.5 self-end">
							{env.images_unavailable && (
								<Button size="push" variant="push" onClick={() => envApi.buildImages()}>
									Build here
								</Button>
							)}
							<Button size="push" variant="push" onClick={() => envApi.retry()}>
								{env.images_unavailable ? "Try again" : "Download"}
							</Button>
						</span>
					</div>
				</Alert>
			)}

			{/* The checks that pass, in one quiet line (what fails is above) */}
			{passed.length > 0 && (
				<p className="flex items-center gap-1.5 text-caption text-muted-foreground">
					<CircleCheck className="size-3.5 text-success" />
					{passed.join(" · ")}
				</p>
			)}

			{/* The details of the part picked on the map; every cluster until
			    the first measurement */}
			{usage
				? cluster && (
						<ClusterCard
							cluster={cluster}
							purpose={purpose(cluster.name, examClusters)}
							usage={usage}
						/>
					)
				: env.clusters.map(c => (
						<ClusterCard key={c.name} cluster={c} purpose={purpose(c.name, examClusters)} />
					))}
			{/* A cluster of ckpro's the app does not manage itself (a proof's) */}
			{!cluster && open && open !== "services" && open !== "others" && usage && (
				<ProofClusterCard cluster={open} usage={usage} />
			)}
			{open === "services" && usage && (
				<ServicesCard
					usage={usage}
					cacheMb={env.host?.cache_mb}
					clearing={env.cache_clearing ?? false}
					missing={missing}
					downloading={env.images_downloading ?? false}
				/>
			)}
			{open === "others" && usage && <OtherAppsCard usage={usage} />}
			{env.clusters.length === 0 && !parts.some(p => p.kind === "proof" || p.kind === "exam") && (
				<p className="text-muted-foreground text-sm">
					No clusters: an exam makes the ones it needs when it starts.
				</p>
			)}
			<section className="flex flex-col gap-2">
				<SectionTitle>Activity</SectionTitle>
				<ActivityList focus={focus?.activity} focusKey={focus?.key} />
			</section>
		</Screen>
	);
}
