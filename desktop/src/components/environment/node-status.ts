import type { StatusTone } from "@ckdry/ui/components/status-dot";
import type { NodeState } from "@/tauri/api";

/** Container state and Kubernetes readiness folded into one tone + label. */
export function nodeStatus(node: NodeState): { tone: StatusTone; label: string } {
	if (node.container.state === "stopped") return { tone: "error", label: "stopped" };
	if (node.container.state === "other") return { tone: "warn", label: node.container.status };
	if (node.ready.state === "ready") return { tone: "ok", label: "Ready" };
	if (node.ready.state === "not_ready") return { tone: "error", label: "NotReady" };
	return { tone: "warn", label: "starting" };
}
