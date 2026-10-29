import type * as React from "react";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import type { Provider } from "@/tauri/api";

/**
 * The agents the assistant can run (each over ACP with its own adapter). The
 * app gives every one the same tools, limits and privacy; what differs is
 * how it runs and signs in (its card in Settings > AI).
 */
export const AGENTS: {
	id: Provider;
	name: string;
	vendor: string;
	Icon: React.ComponentType<{ className?: string }>;
	/** Its mark's colour (an app token) */
	tint: string;
}[] = [
	{ id: "claude", name: "Claude Code", vendor: "Anthropic", Icon: ClaudeIcon, tint: "text-claude" },
];

export const agentOf = (id: Provider) => AGENTS.find(a => a.id === id) ?? AGENTS[0];
