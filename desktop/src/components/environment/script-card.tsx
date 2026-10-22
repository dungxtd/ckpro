import { Button } from "@ckiu/ui/components/button";
import { Input } from "@ckiu/ui/components/input";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, labApi } from "@/tauri/api";

const SAMPLE_SCRIPT =
	"/Users/d/pwd/CK-X/facilitator/assets/exams/cka/001/scripts/validation/q1_s1_validate_namespace.sh";

/** Temporary until the lab engine: run one CK-X script on a cluster. */
export function ScriptCard({ cluster }: { cluster: string }) {
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
		<section className="rounded-lg border border-border bg-card p-3">
			<h2 className="mb-2 font-semibold text-sm">Lab script on {cluster}</h2>
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
		</section>
	);
}
