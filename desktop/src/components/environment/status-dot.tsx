import { cn } from "@ckiu/ui/lib/utils";
import type { NodeState } from "@/tauri/api";

type Tone = "ok" | "warn" | "error" | "idle";

const TONE: Record<Tone, string> = {
	ok: "bg-green-500",
	warn: "bg-amber-500",
	error: "bg-red-500",
	idle: "bg-muted-foreground/40",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
	return (
		<span className={cn("inline-block size-2 shrink-0 rounded-full", TONE[tone], className)} />
	);
}

/** Container state and Kubernetes readiness folded into one tone + label. */
export function nodeStatus(node: NodeState): { tone: Tone; label: string } {
	if (node.container.state === "stopped") return { tone: "error", label: "stopped" };
	if (node.container.state === "other") return { tone: "warn", label: node.container.status };
	if (node.ready.state === "ready") return { tone: "ok", label: "Ready" };
	if (node.ready.state === "not_ready") return { tone: "error", label: "NotReady" };
	return { tone: "warn", label: "starting" };
}
