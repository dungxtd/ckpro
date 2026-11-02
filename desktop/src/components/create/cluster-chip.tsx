import { Button } from "@cktry/ui/components/button";
import { IconButton } from "@cktry/ui/components/icon-button";
import { Spinner } from "@cktry/ui/components/spinner";
import { StatusDot } from "@cktry/ui/components/status-dot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@cktry/ui/components/tooltip";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStudio } from "@/stores/studio";

/**
 * The verify cluster new questions are proven on: made as the screen opens,
 * so proving starts at once. × stops making it or removes it (its memory
 * back); Prepare makes it again. `short`: its words cut, for a narrow bar
 */
export function ClusterChip({ short = false }: { short?: boolean }) {
	const workspace = useStudio(s => s.workspace);
	// Making one takes a minute or so: how long so far, so it never looks stuck
	const [since, setSince] = useState<number | null>(null);
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (workspace.state !== "preparing") return setSince(null);
		setSince(Date.now());
		const tick = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(tick);
	}, [workspace.state]);
	const seconds = since === null ? 0 : Math.max(0, Math.round((now - since) / 1000));
	const { prepare, release } = useStudio.getState();
	return (
		<div className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">
			{(workspace.state === "preparing" || workspace.state === "ready") && (
				<span className="flex h-6 min-w-0 items-center gap-1.5 rounded-full border border-border pr-0.5 pl-2.5">
					{workspace.state === "preparing" ? (
						<>
							<Spinner size="inline" className="size-3.5" />
							<span className="truncate tabular-nums">
								{short ? "Making" : "Making cluster"}… {seconds}s
							</span>
						</>
					) : (
						<>
							<StatusDot tone="ok" />
							<span className="truncate">{short ? "Ready" : "Cluster ready"}</span>
						</>
					)}
					<IconButton
						variant="toolbar"
						size="xs"
						aria-label={
							workspace.state === "ready"
								? "Remove the verify cluster"
								: "Stop making the verify cluster"
						}
						onClick={release}
					>
						<X />
					</IconButton>
				</span>
			)}
			{workspace.state === "failed" && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="flex min-w-0 items-center gap-2 text-destructive">
							<StatusDot tone="error" />
							<span className="truncate">No cluster</span>
						</span>
					</TooltipTrigger>
					<TooltipContent className="max-w-80 whitespace-normal">{workspace.reason}</TooltipContent>
				</Tooltip>
			)}
			{workspace.state === "off" && <span className="truncate">No cluster</span>}
			{(workspace.state === "off" || workspace.state === "failed") && (
				<Button size="push" variant="push" onClick={prepare}>
					{workspace.state === "failed" ? "Retry" : "Prepare"}
				</Button>
			)}
		</div>
	);
}
