import { Button } from "@ckpro/ui/components/button";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Spinner } from "@ckpro/ui/components/spinner";
import { StatusDot } from "@ckpro/ui/components/status-dot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ckpro/ui/components/tooltip";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useStudio } from "@/stores/studio";

/**
 * The verify cluster new questions are proven on: made as the screen opens,
 * so proving starts at once. × stops making it or removes it (its memory
 * back); Prepare makes it again
 */
export function ClusterChip() {
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
			{workspace.state === "preparing" && (
				<>
					<Spinner size="inline" className="size-3.5" />
					<span className="truncate tabular-nums">Making cluster… {seconds}s</span>
				</>
			)}
			{workspace.state === "ready" && (
				<>
					<StatusDot tone="ok" />
					<span className="truncate">Cluster ready</span>
				</>
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
			{workspace.state === "preparing" || workspace.state === "ready" ? (
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
			) : (
				<Button size="push" variant="push" onClick={prepare}>
					{workspace.state === "failed" ? "Retry" : "Prepare"}
				</Button>
			)}
		</div>
	);
}
