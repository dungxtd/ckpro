import { Badge } from "@ckiu/ui/components/badge";
import { Button } from "@ckiu/ui/components/button";
import { Input } from "@ckiu/ui/components/input";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TerminalView } from "@/components/terminal/terminal-view";
import { useEnvironment } from "@/stores/environment";
import { ApiError, labApi } from "@/tauri/api";

const SAMPLE_SCRIPT =
	"/Users/d/pwd/CK-X/facilitator/assets/exams/cka/001/scripts/validation/q1_s1_validate_namespace.sh";

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
	return (
		<section className="rounded-lg border border-border bg-card p-3">
			<h2 className="mb-2 flex items-center gap-2 font-semibold text-sm">{title}</h2>
			{children}
		</section>
	);
}

function DockerBadge() {
	const docker = useEnvironment(s => s.docker);
	if (docker.state === "checking") return <Badge>Docker: checking…</Badge>;
	if (docker.state === "ok") return <Badge variant="success">Docker: {docker.engine}</Badge>;
	return <Badge className="text-destructive">{docker.reason}</Badge>;
}

function ClusterCard() {
	const { clusterName, workers, job, log, lastResult, setCluster, runClusterJob } =
		useEnvironment();
	const logRef = useRef<HTMLPreElement>(null);
	// Follow the log as kind prints it
	useEffect(() => {
		if (log.length) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
	}, [log]);

	return (
		<Card title="Cluster">
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={e => {
					e.preventDefault();
					runClusterJob("create");
				}}
			>
				<Input
					className="w-40"
					value={clusterName}
					onChange={e => setCluster({ clusterName: e.target.value })}
					aria-label="Cluster name"
				/>
				<Input
					className="w-20"
					type="number"
					min={0}
					max={9}
					value={workers}
					onChange={e => setCluster({ workers: Number(e.target.value) })}
					aria-label="Workers"
				/>
				<Button type="submit" size="sm" disabled={!!job}>
					{job?.action === "create" ? "Creating…" : "Create"}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!!job}
					onClick={() => runClusterJob("delete")}
				>
					{job?.action === "delete" ? "Deleting…" : "Delete"}
				</Button>
				{lastResult && (
					<span className={lastResult.ok ? "text-green-500 text-xs" : "text-destructive text-xs"}>
						{lastResult.message}
					</span>
				)}
			</form>
			{log.length > 0 && (
				<pre ref={logRef} className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
					{log.join("\n")}
				</pre>
			)}
		</Card>
	);
}

function ScriptCard() {
	const cluster = useEnvironment(s => s.clusterName);
	const [path, setPath] = useState(SAMPLE_SCRIPT);
	const [result, setResult] = useState<string | null>(null);
	const [running, setRunning] = useState(false);

	const run = async () => {
		setRunning(true);
		try {
			const r = await labApi.runScript(cluster, path);
			setResult(`exit ${r.exit_code} ${r.exit_code === 0 ? "PASS" : "FAIL"}\n${r.output}`);
		} catch (e) {
			setResult(null);
			toast.error(e instanceof ApiError ? e.message : String(e));
		} finally {
			setRunning(false);
		}
	};

	return (
		<Card title="Lab script">
			<div className="flex gap-2">
				<Input
					className="flex-1"
					value={path}
					onChange={e => setPath(e.target.value)}
					aria-label="Script path"
				/>
				<Button size="sm" onClick={run} disabled={running}>
					{running ? "Running…" : "Run"}
				</Button>
			</div>
			{result && (
				<pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">{result}</pre>
			)}
		</Card>
	);
}

export function Playground() {
	const refreshDocker = useEnvironment(s => s.refreshDocker);
	const cluster = useEnvironment(s => s.clusterName);
	const [session, setSession] = useState(0);
	useEffect(() => {
		refreshDocker();
	}, [refreshDocker]);

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<header className="flex items-center justify-between">
				<strong>ckiu</strong>
				<DockerBadge />
			</header>
			<ClusterCard />
			<ScriptCard />
			<Card
				title={
					<>
						Terminal
						<Button size="sm" variant="outline" onClick={() => setSession(n => n + 1)}>
							Open shell on {cluster}-control-plane
						</Button>
					</>
				}
			>
				<div className="h-72">
					<TerminalView container={`${cluster}-control-plane`} session={session} />
				</div>
			</Card>
		</div>
	);
}
