import { Chip } from "@ckdry/ui/components/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@ckdry/ui/components/popover";
import { cn } from "@ckdry/ui/lib/utils";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ActivityProgress } from "@/components/activity/activity-progress";
import { ActivityStatusIcon } from "@/components/activity/activity-status-icon";
import { useActivityList } from "@/stores/activity";

/** How long a failure stays in the top bar */
const FAILED_SHOWN_MS = 5 * 60_000;

/**
 * Top-bar status while something runs in the background (clusters starting
 * after the app reopened, a cluster being created…), or just failed. Opens
 * its progress and log. `compact` beside the capsule, which takes the
 * middle of the bar: the icon alone, its words for assistive technology
 */
export function ActivityChip({ compact = false }: { compact?: boolean }) {
	const list = useActivityList();
	const running = list.filter(a => a.status === "running");
	const [now, setNow] = useState(Date.now);
	const failed = list.find(
		a => a.status === "failed" && a.finished_at && now - a.finished_at < FAILED_SHOWN_MS
	);
	// Gone from the bar when its time is up, not at some later render
	const expires = failed?.finished_at ? failed.finished_at + FAILED_SHOWN_MS : null;
	useEffect(() => {
		if (expires === null) return;
		const id = setTimeout(() => setNow(Date.now()), Math.max(0, expires - Date.now()) + 50);
		return () => clearTimeout(id);
	}, [expires]);
	// A failure that comes later is measured from then
	const latest = list[0]?.id;
	useEffect(() => {
		if (latest !== undefined) setNow(Date.now());
	}, [latest]);
	const shown = running[0] ?? failed;
	if (!shown) return null;

	const isFailed = shown.status === "failed";
	const words = isFailed ? `Failed: ${shown.title}` : shown.title;
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Chip
					title={compact ? words : undefined}
					className={cn(
						"ml-auto max-w-80",
						isFailed &&
							"bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
					)}
					count={running.length > 1 ? running.length : undefined}
				>
					<ActivityStatusIcon status={shown.status} className="size-3.5 text-current" />
					<span className={compact ? "sr-only" : "truncate"}>{words}</span>
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
