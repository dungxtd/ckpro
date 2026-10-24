import { Chip } from "@ckdry/ui/components/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@ckdry/ui/components/popover";
import { cn } from "@ckdry/ui/lib/utils";
import { Link } from "react-router";
import { useActivityList } from "@/stores/activity";
import { ActivityProgress } from "./activity-progress";
import { ActivityStatusIcon } from "./activity-status-icon";

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
			<PopoverTrigger asChild>
				<Chip
					className={cn(
						"ml-auto max-w-80",
						isFailed &&
							"bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
					)}
					count={running.length > 1 ? running.length : undefined}
				>
					<ActivityStatusIcon status={shown.status} className="size-3.5 text-current" />
					<span className="truncate">{isFailed ? `Failed: ${shown.title}` : shown.title}</span>
				</Chip>
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
