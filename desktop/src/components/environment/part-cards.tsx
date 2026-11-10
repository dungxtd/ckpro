import { Button } from "@ckpro/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@ckpro/ui/components/card";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { StatusDot, type StatusTone } from "@ckpro/ui/components/status-dot";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { envApi, errorText } from "@/tauri/api";
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
	/** What can be done to it, at the row's end */
	action?: ReactNode;
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
					{r.action && <span className={r.mb === undefined ? "ml-auto" : ""}>{r.action}</span>}
				</li>
			))}
		</ul>
	);
}

/** ckpro's own services: what runs now and what it takes; the ones that
 * start with an exam say so when they are not running */
export function ServicesCard({
	usage,
	cacheMb,
	clearing,
}: {
	usage: ContainerUse[];
	/** What the image mirror's cache holds, once read */
	cacheMb?: number;
	/** The cache is being emptied now */
	clearing: boolean;
}) {
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
	// The mirror's cache: its size, and emptying it (asked first)
	const mirror = rows.find(r => r.key === "ckpro-mirror");
	if (mirror && cacheMb !== undefined) {
		mirror.what = clearing
			? "Caches the images clusters pull · emptying the cache…"
			: `Caches the images clusters pull · ${memory(cacheMb)} cached`;
		mirror.action = clearing ? (
			<Button size="push" variant="push" disabled>
				Clearing…
			</Button>
		) : (
			<ConfirmDialog
				title="Clear the image cache?"
				description="The images clusters pulled through ckpro go; the next exam downloads them again. Not while an exam is open or being proven."
				action="Clear Cache"
				onConfirm={() => envApi.clearCache().catch(e => toast.error(errorText(e)))}
			>
				<Button size="push" variant="push">
					Clear…
				</Button>
			</ConfirmDialog>
		);
	}
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
