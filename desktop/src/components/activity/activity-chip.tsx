import { Popover, PopoverContent, PopoverTrigger } from "@ckdry/ui/components/popover";
import { cn } from "@ckdry/ui/lib/utils";
import { AlertCircle, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { useActivityList } from "@/stores/activity";
import { ActivityProgress } from "./activity-progress";

/** How long a failure stays in the top bar */
const FAILED_SHOWN_MS = 5 * 60_000;

/**
 * Top-bar status while something runs in the background (clusters starting
 * after the app reopened, a cluster being created…), or just failed. Opens
 * its progress and log.
 */
export function ActivityChip() {
	const list = useActivityList();
	const running = list.filter(a => a.status === "running");
	const failed = list.find(
		a => a.status === "failed" && a.finished_at && Date.now() - a.finished_at < FAILED_SHOWN_MS
	);
	const shown = running[0] ?? failed;
	if (!shown) return null;

	const isFailed = shown.status === "failed";
	return (
		<Popover>
			<PopoverTrigger
				className={cn(
					"ml-auto flex max-w-80 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
					isFailed ? "border-red-500/40 text-red-500" : "border-border text-muted-foreground"
				)}
			>
				{isFailed ? (
					<AlertCircle className="size-3.5" />
				) : (
					<Loader2 className="size-3.5 animate-spin" />
				)}
				<span className="truncate">
					{isFailed ? `Failed: ${shown.title}` : shown.title}
					{running.length > 1 && ` (+${running.length - 1})`}
				</span>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[28rem]">
				<ActivityProgress id={shown.id} compact />
				<Link
					to="/environment#activity"
					className="mt-3 block text-right text-muted-foreground text-xs hover:underline"
				>
					All activity
				</Link>
			</PopoverContent>
		</Popover>
	);
}
