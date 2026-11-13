import { cn } from "@ckpro/ui/lib/utils";
import { nodeStatus } from "@/components/environment/node-status";
import type { ClusterState, ContainerUse } from "@/tauri/bindings";
import { memory } from "@/words";
import { nodeMb, type Part } from "./usage";

const TONE: Record<Part["kind"], string> = {
	exam: "border-highlight/50 bg-highlight/15",
	proof: "border-assistant/50 bg-assistant/15",
	other: "border-border bg-fill-quiet",
	services: "border-border bg-fill-quiet",
	// Not ckpro's: dashed and unfilled, as the kit draws what the app does not own
	others: "border-border border-dashed bg-transparent",
	machine: "border-border border-dashed bg-transparent",
};

const WHAT: Record<Part["kind"], string> = {
	exam: "Your exam",
	proof: "A proof",
	other: "Cluster",
	services: "Services",
	others: "Not ckpro's",
	machine: "Not ckpro's",
};

/**
 * Docker's memory as one box, in parts by what uses it: ckpro's clusters
 * (their nodes inside), its services, other apps, what the machine takes
 * outside the containers, then the free room, where
 * an exam's estimated need is drawn to compare (an estimate, not a verdict).
 * A part opens its details below
 */
export function MemoryMap({
	totalMb,
	parts,
	clusters,
	usage,
	estimate,
	open,
	onOpen,
}: {
	totalMb: number;
	parts: Part[];
	clusters: ClusterState[];
	usage: ContainerUse[];
	/** An exam's comfortable need, to compare with the free room: what
	 * (`A CKA exam`) and how much */
	estimate: { what: string; mb: number } | null;
	open: string | null;
	onOpen: (key: string) => void;
}) {
	const used = parts.reduce((n, p) => n + p.mb, 0);
	const free = Math.max(0, totalMb - used);
	const tight = estimate !== null && estimate.mb > free;
	return (
		<div className="flex flex-col gap-1.5">
			<div
				role="img"
				aria-label={`What uses Docker's memory: ${memory(used)} used, ${memory(free)} free`}
				className="flex h-28 gap-1 rounded-xl border border-border bg-card p-1.5"
			>
				{parts.map(part => {
					// Its nodes: the app's state, else what was measured (a proof's)
					const known = clusters.find(c => c.name === part.key)?.nodes;
					const nodes =
						known?.map(n => ({
							name: n.name,
							tone: nodeStatus(n).tone,
							label: nodeStatus(n).label,
						})) ??
						usage
							.filter(c => c.owner.kind === "cluster" && c.owner.cluster === part.key)
							.map(c => ({ name: c.name, tone: "ok" as const, label: "running" }));
					return (
						<button
							key={part.key}
							type="button"
							aria-expanded={open === part.key}
							onClick={() => onOpen(part.key)}
							style={{ flex: `${Math.max(part.mb, totalMb * 0.06)} 1 0` }}
							className={cn(
								"flex min-w-16 flex-col overflow-hidden rounded-lg border p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
								TONE[part.kind],
								open === part.key && "ring-2 ring-highlight"
							)}
						>
							<span className="truncate font-medium text-caption">{part.label}</span>
							<span className="truncate text-2xs text-muted-foreground">{WHAT[part.kind]}</span>
							{/* A cluster's nodes, by what each takes; one not ready is marked */}
							{nodes.length > 0 && (
								<span className="mt-1 flex min-h-0 flex-1 gap-0.5">
									{nodes.map(n => (
										<span
											key={n.name}
											title={`${n.name}: ${n.label}`}
											style={{ flex: `${nodeMb(usage, n.name) ?? 1} 1 0` }}
											className={cn(
												"min-w-1 rounded-sm bg-foreground/10",
												n.tone !== "ok" && "bg-warning/40"
											)}
										/>
									))}
								</span>
							)}
							<span className="mt-auto pt-1 text-2xs tabular-nums">{memory(part.mb)}</span>
						</button>
					);
				})}
				{/* The free room, and an exam's estimated need laid in it */}
				<div style={{ flex: `${free} 1 0` }} className="relative min-w-0">
					{estimate && (
						<div
							style={{ width: `${free > 0 ? Math.min(100, (estimate.mb / free) * 100) : 100}%` }}
							className={cn(
								"absolute inset-y-0 left-0 flex flex-col justify-center overflow-hidden rounded-lg border border-dashed px-2 text-2xs",
								tight
									? "border-warning/70 text-warning"
									: "border-foreground/25 text-muted-foreground"
							)}
						>
							<span className="truncate">{estimate.what}</span>
							<span className="truncate opacity-75">about {memory(estimate.mb)}, an estimate</span>
						</div>
					)}
				</div>
			</div>
			<div className="flex justify-between px-0.5 text-2xs text-muted-foreground tabular-nums">
				<span>0</span>
				<span>{memory(totalMb)}</span>
			</div>
		</div>
	);
}
