import type * as React from "react";

/**
 * The assistant's mark: a bot whose antenna is a hexagon, after Kubernetes.
 * It stands for the assistant whichever agent answers (each agent keeps its
 * own logo, `AGENTS`); drawn like lucide (24 grid, stroke 2) and takes
 * `currentColor`.
 */
export function AssistantIcon(props: React.ComponentProps<"svg">) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<rect width="16" height="12" x="4" y="8" rx="2" />
			<path d="M12 8V5.5" />
			<path d="M12 1.5l1.73 1v2l-1.73 1-1.73-1v-2z" />
			<path d="M2 14h2" />
			<path d="M20 14h2" />
			<path d="M15 13v2" />
			<path d="M9 13v2" />
		</svg>
	);
}
