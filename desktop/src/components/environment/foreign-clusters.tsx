import { Button } from "@ckdry/ui/components/button";
import { useEnvironment } from "@/stores/environment";

/** kind clusters on this machine that ckdry does not manage yet. */
export function ForeignClusters({ names }: { names: string[] }) {
	const job = useEnvironment(s => s.job);
	const runJob = useEnvironment(s => s.runJob);
	if (names.length === 0) return null;

	return (
		<section className="rounded-lg border border-border border-dashed p-3">
			<h2 className="font-semibold text-sm">Other kind clusters</h2>
			<p className="mb-2 text-muted-foreground text-xs">
				Created outside ckdry (kind CLI or an older install). Adopt one to manage it here; its name
				is taken until then.
			</p>
			<ul className="flex flex-col gap-1">
				{names.map(name => (
					<li key={name} className="flex items-center gap-2 text-sm">
						<span className="font-mono">{name}</span>
						<div className="ml-auto flex gap-1.5">
							<Button size="sm" disabled={job !== null} onClick={() => runJob("adopt", name)}>
								Adopt
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={job !== null}
								onClick={() => runJob("delete", name)}
							>
								Delete
							</Button>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}
