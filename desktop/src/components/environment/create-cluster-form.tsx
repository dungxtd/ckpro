import { Button } from "@ckiu/ui/components/button";
import { Input } from "@ckiu/ui/components/input";
import { CircleCheck, CircleX } from "lucide-react";
import { useEffect, useRef } from "react";
import { useEnvironment } from "@/stores/environment";

export function CreateClusterForm() {
	const { form, preflight, job, log, lastResult, env } = useEnvironment();
	const { setForm, refreshPreflight, runJob, cancelJob } = useEnvironment();
	const logRef = useRef<HTMLPreElement>(null);

	// Re-check whenever the topology or the environment changes
	useEffect(() => {
		if (env) refreshPreflight();
	}, [env, refreshPreflight]);

	// Follow the log as kind prints it
	useEffect(() => {
		if (log.length) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
	}, [log]);

	const blocked = preflight.some(c => !c.ok);
	const creating = job?.action === "create";

	return (
		<section className="rounded-lg border border-border bg-card p-3">
			<h2 className="mb-2 font-semibold text-sm">New cluster</h2>
			<form
				className="flex flex-wrap items-center gap-2"
				onSubmit={e => {
					e.preventDefault();
					runJob("create");
				}}
			>
				<Input
					className="w-40"
					value={form.name}
					onChange={e => {
						setForm({ name: e.target.value.trim().toLowerCase() });
						refreshPreflight();
					}}
					aria-label="Cluster name"
				/>
				<Input
					className="w-20"
					type="number"
					min={0}
					max={9}
					value={form.workers}
					onChange={e => {
						setForm({ workers: Number(e.target.value) });
						refreshPreflight();
					}}
					aria-label="Workers"
				/>
				{creating ? (
					<Button type="button" size="sm" variant="destructive" onClick={cancelJob}>
						Cancel
					</Button>
				) : (
					<Button type="submit" size="sm" disabled={job !== null || blocked}>
						Create
					</Button>
				)}
				{lastResult && (
					<span className={lastResult.ok ? "text-green-500 text-xs" : "text-red-500 text-xs"}>
						{lastResult.message}
					</span>
				)}
			</form>
			<ul className="mt-2 flex flex-col gap-0.5 text-xs">
				{preflight.map(check => (
					<li key={check.name} className="flex items-start gap-1.5">
						{check.ok ? (
							<CircleCheck className="size-3.5 shrink-0 text-green-500" />
						) : (
							<CircleX className="size-3.5 shrink-0 text-red-500" />
						)}
						<span>
							<strong>{check.name}</strong>{" "}
							<span className="text-muted-foreground">{check.detail}</span>
						</span>
					</li>
				))}
			</ul>
			{log.length > 0 && (
				<pre ref={logRef} className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
					{log.join("\n")}
				</pre>
			)}
		</section>
	);
}
