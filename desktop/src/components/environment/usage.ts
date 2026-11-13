import type { ContainerUse, MachineMemory } from "@/tauri/bindings";

/** What a cluster is there for: the attempt's, a Create proof's, or neither */
export type Purpose = "exam" | "proof" | "other";

/** A Create proof's clusters are named after their run (`k8s-v641f`) */
const PROOF = /-v[0-9a-f]{4,}$/;

export function purpose(cluster: string, examClusters: string[]): Purpose {
	if (examClusters.includes(cluster)) return "exam";
	return PROOF.test(cluster) ? "proof" : "other";
}

/** One part of Docker's memory on the map */
export interface Part {
	key: string;
	label: string;
	mb: number;
	kind: Purpose | "services" | "others" | "machine";
}

/**
 * What Docker's machine takes outside every container: its memory in use
 * less the containers'. The engine itself in OrbStack or Docker Desktop;
 * with Docker Engine on Linux, the computer's own programs too
 */
export function outside(usage: ContainerUse[], memory: MachineMemory): number {
	const containers = usage.reduce((n, c) => n + c.mb, 0);
	return Math.max(0, memory.total_mb - memory.available_mb - containers);
}

/**
 * Docker's memory in parts: each of ckpro's clusters, its services together,
 * other apps together, then what the machine takes outside the containers
 * (once `memory` is measured); largest cluster first. What is left is the
 * free part. `known`: the app's clusters, each a part even when nothing of
 * it runs (a stopped node takes nothing, and is still to repair)
 */
export function parts(
	usage: ContainerUse[],
	examClusters: string[],
	known: string[] = [],
	memory: MachineMemory | null = null
): Part[] {
	const clusters = new Map<string, number>(known.map(name => [name, 0]));
	let services = 0;
	let others = 0;
	for (const c of usage) {
		if (c.owner.kind === "cluster")
			clusters.set(c.owner.cluster, (clusters.get(c.owner.cluster) ?? 0) + c.mb);
		else if (c.owner.kind === "service") services += c.mb;
		else others += c.mb;
	}
	const list: Part[] = [...clusters]
		.map(([name, mb]) => ({ key: name, label: name, mb, kind: purpose(name, examClusters) }))
		.sort((a, b) => b.mb - a.mb);
	if (services > 0)
		list.push({ key: "services", label: "Exam tools", mb: services, kind: "services" });
	if (others > 0)
		list.push({ key: "others", label: "Other containers", mb: others, kind: "others" });
	const machine = memory ? outside(usage, memory) : 0;
	if (machine > 0)
		list.push({ key: "machine", label: "Other programs", mb: machine, kind: "machine" });
	return list;
}

/** A node's memory now, if measured */
export const nodeMb = (usage: ContainerUse[] | null | undefined, node: string) =>
	usage?.find(c => c.name === node)?.mb;

/** ckpro's own services, by container: the task host, the desktop, the
 * mirror; a proof's own task host is named after its run */
export function serviceName(container: string): string {
	if (container === "ckpro-mirror") return "Image mirror";
	if (container.startsWith("ckpro-jumphost-")) return "Task host of a proof";
	if (container.startsWith("ckpro-jumphost")) return "Task host";
	if (container.startsWith("ckpro-desktop")) return "Exam desktop";
	return container;
}

/** Other containers, a kind cluster as one: (name, what it is, MB), largest first */
export function otherApps(usage: ContainerUse[]): { name: string; what: string; mb: number }[] {
	const kind = new Map<string, number>();
	const rows: { name: string; what: string; mb: number }[] = [];
	for (const c of usage) {
		if (c.owner.kind !== "other") continue;
		if (c.owner.cluster) kind.set(c.owner.cluster, (kind.get(c.owner.cluster) ?? 0) + c.mb);
		else rows.push({ name: c.name, what: "container", mb: c.mb });
	}
	for (const [name, mb] of kind) rows.push({ name, what: "kind cluster", mb });
	return rows.sort((a, b) => b.mb - a.mb);
}
