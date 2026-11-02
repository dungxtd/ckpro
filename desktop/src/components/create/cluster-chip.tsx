import { Button } from "@cktry/ui/components/button";
import { IconButton } from "@cktry/ui/components/icon-button";
import { Spinner } from "@cktry/ui/components/spinner";
import { StatusDot } from "@cktry/ui/components/status-dot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@cktry/ui/components/tooltip";
import { X } from "lucide-react";
import { useStudio } from "@/stores/studio";

/**
 * The verify cluster new questions are proven on: made as the screen opens,
 * so proving starts at once. × stops making it or removes it (its memory
 * back); Prepare makes it again
 */
export function ClusterChip() {
	const workspace = useStudio(s => s.workspace);
	const { prepare, release } = useStudio.getState();
	return (
		<div className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">
			{workspace.state === "preparing" && (
				<>
					<Spinner size="inline" className="size-3.5" />
					<span className="truncate">Making the verify cluster…</span>
				</>
			)}
			{workspace.state === "ready" && (
				<>
					<StatusDot tone="ok" />
					<span className="truncate">Verify cluster ready</span>
				</>
			)}
			{workspace.state === "failed" && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="flex min-w-0 items-center gap-2 text-destructive">
							<StatusDot tone="error" />
							<span className="truncate">No verify cluster</span>
						</span>
					</TooltipTrigger>
					<TooltipContent className="max-w-80 whitespace-normal">{workspace.reason}</TooltipContent>
				</Tooltip>
			)}
			{workspace.state === "off" && <span className="truncate">No verify cluster</span>}
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
