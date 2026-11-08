import { Card, CardDescription, CardHeader, CardTitle } from "@ckpro/ui/components/card";
import { StatusDot, type StatusTone } from "@ckpro/ui/components/status-dot";
import type { ContainerUse } from "@/tauri/bindings";
import { memory } from "@/words";
import { otherApps, serviceName } from "./usage";

/** A row of a details card: its state as a dot, a name to copy, what it
 * is, the memory it takes (when measured) */
export interface Row {
	key: string;
	tone: StatusTone;
	name: string;
	what: string;
	mb?: number;
}

export function Rows({ rows }: { rows: Row[] }) {
	return (
		<ul className="flex flex-col">
			{rows.map(r => (
				<li key={r.key} className="flex items-center gap-2 py-1 text-sm">
					<StatusDot tone={r.tone} />
					<span className="select-text">{r.name}</span>
					<span className="min-w-0 truncate text-muted-foreground text-xs">{r.what}</span>
					{r.mb !== undefined && (
						<span className="ml-auto text-muted-foreground text-xs tabular-nums">
							{memory(r.mb)}
						</span>
					)}
				</li>
			))}
		</ul>
	);
}

/** ckpro's own services: what runs now and what it takes; the ones that
 * start with an exam say so when they are not running */
export function ServicesCard({ usage }: { usage: ContainerUse[] }) {
	const running = usage.filter(c => c.owner.kind === "service");
	const rows: Row[] = running.map(c => ({
		key: c.name,
		tone: "ok",
		name: serviceName(c.name),
		what: c.name,
		mb: c.mb,
	}));
	for (const [name, what] of [
		["ckpro-jumphost", "Starts with an exam: the host every task is solved from"],
		["ckpro-desktop", "Starts with an exam: the desktop of the exam desk"],
		["ckpro-mirror", "Caches the images clusters pull"],
	] as const)
		if (!running.some(c => c.name === name))
			rows.push({ key: name, tone: "idle", name: serviceName(name), what, mb: undefined });
	return (
		<Card padding="sm">
			<CardHeader>
				<CardTitle>ckpro</CardTitle>
				<CardDescription>What every exam uses</CardDescription>
			</CardHeader>
			<Rows rows={rows} />
		</Card>
	);
}

/** What else runs in the same Docker: ckpro leaves it alone */
export function OtherAppsCard({ usage }: { usage: ContainerUse[] }) {
	const rows: Row[] = otherApps(usage).map(a => ({ key: a.name, tone: "ok", ...a }));
	return (
		<Card padding="sm">
			<CardHeader>
				<CardTitle>Other apps</CardTitle>
				<CardDescription>
					ckpro leaves these alone; stop them in OrbStack or Docker Desktop to free their memory
				</CardDescription>
			</CardHeader>
			<Rows rows={rows} />
		</Card>
	);
}

/** A cluster ckpro made for a proof (or a verify run): its nodes and what
 * they take. It goes with its proof; Create stops it */
export function ProofClusterCard({ cluster, usage }: { cluster: string; usage: ContainerUse[] }) {
	const nodes = usage.filter(c => c.owner.kind === "cluster" && c.owner.cluster === cluster);
	return (
		<Card padding="sm">
			<CardHeader>
				<CardTitle>{cluster}</CardTitle>
				<CardDescription>
					A Create proof's: removed when the proof ends (stop it in Create)
				</CardDescription>
			</CardHeader>
			<Rows
				rows={nodes.map(n => ({
					key: n.name,
					tone: "ok",
					name: n.name,
					what: n.name.endsWith("-control-plane") ? "control plane" : "worker",
					mb: n.mb,
				}))}
			/>
		</Card>
	);
}
