import { Button } from "@ckpro/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@ckpro/ui/components/card";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { StatusDot, type StatusTone } from "@ckpro/ui/components/status-dot";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { envApi, errorText } from "@/tauri/api";
import type { ContainerUse, MachineMemory } from "@/tauri/bindings";
import { memory } from "@/words";
import { otherApps, outside, serviceName } from "./usage";

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
					{/* A long name gives way before what it is does */}
					<span className="min-w-0 shrink select-text truncate">{r.name}</span>
					<span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
						{r.what}
					</span>
					{r.mb !== undefined && (
						<span className="ml-auto shrink-0 text-caption text-muted-foreground tabular-nums">
							{memory(r.mb)}
						</span>
					)}
					{r.action && (
						<span className={r.mb === undefined ? "ml-auto shrink-0" : "shrink-0"}>{r.action}</span>
					)}
				</li>
			))}
		</ul>
	);
}

/** The images an exam runs on */
const IMAGES = [
	["ckpro-node", "Every cluster node"],
	["ckpro-jumphost", "The task host"],
	["ckpro-desktop", "The exam desktop"],
] as const;

/** ckpro's own services: what runs now and what it takes; the ones that
 * start with an exam say so when they are not running. Under them, each
 * image an exam runs on: downloaded, being downloaded, or not yet */
export function ServicesCard({
	usage,
	cacheMb,
	clearing,
	missing,
	downloading,
}: {
	usage: ContainerUse[];
	/** The images not downloaded yet (`ckpro-…`) */
	missing: string[];
	/** They are being downloaded now */
	downloading: boolean;
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
				action="Clear cache"
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
			<div className="mt-3 mb-1 font-semibold text-caption text-muted-foreground">Images</div>
			<Rows
				rows={IMAGES.map(([name, what]) => {
					const absent = missing.includes(name);
					return {
						key: `image-${name}`,
						tone: absent ? (downloading ? "idle" : "warn") : "ok",
						name,
						what: `${what} · ${absent ? (downloading ? "downloading…" : "not downloaded") : "downloaded"}`,
					};
				})}
			/>
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
				<CardDescription>ckpro leaves these alone; stop them to free their memory</CardDescription>
			</CardHeader>
			<Rows rows={rows} />
		</Card>
	);
}

/** What Docker's machine takes outside every container, and what it has
 * left: what ckpro weighs before it starts an exam or a proof */
export function MachineCard({ usage, memory }: { usage: ContainerUse[]; memory: MachineMemory }) {
	return (
		<Card padding="sm">
			<CardHeader>
				<CardTitle>Outside containers</CardTitle>
				<CardDescription>
					With Docker Engine on Linux, this computer's own programs (a browser, an editor); with
					OrbStack or Docker Desktop, the engine itself. ckpro counts them before an exam starts
				</CardDescription>
			</CardHeader>
			<Rows
				rows={[
					{
						key: "outside",
						tone: "ok",
						name: "In use",
						what: "outside every container",
						mb: outside(usage, memory),
					},
					{
						key: "available",
						tone: "idle",
						name: "Available",
						what: "what new containers can take, page cache given back",
						mb: memory.available_mb,
					},
				]}
			/>
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
