import { Chip } from "@ckpro/ui/components/chip";
import { cn } from "@ckpro/ui/lib/utils";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ActivityStatusIcon } from "@/components/activity/activity-status-icon";
import { useActivityList } from "@/stores/activity";

/** How long a failure stays in the top bar */
const FAILED_SHOWN_MS = 5 * 60_000;

/**
 * Top-bar status while something runs in the background (clusters starting
 * after the app reopened, a cluster being created…), or just failed. Opens
 * the Environment screen at its log. An icon in the corner, its words sliding
 * out under the pointer; a cancelled one (stopped on purpose) is not shown
 */
export function ActivityChip() {
	const list = useActivityList();
	const navigate = useNavigate();
	const { pathname } = useLocation();
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
	// On the Environment page the activity list shows it already
	if (!shown || pathname === "/environment") return null;

	const isFailed = shown.status === "failed";
	const words = isFailed ? `Failed: ${shown.title}` : shown.title;
	const count = running.length > 1 ? running.length : undefined;
	const open = () =>
		navigate("/environment", {
			state: { activity: shown.id },
			replace: pathname === "/environment",
		});
	const tone =
		isFailed && "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive";
	return (
		// An icon in the corner; under the pointer (or focused) it slides out to
		// its words, over what is beside it: the bar's layout never moves
		<span className="group/chip relative ml-auto flex h-7 items-center">
			<Chip aria-hidden tabIndex={-1} className={cn("invisible", tone)} count={count}>
				<ActivityStatusIcon status={shown.status} className="size-3.5 text-current" />
			</Chip>
			<Chip
				onClick={open}
				aria-label={words}
				className={cn(
					"absolute top-0 right-0 z-10 shadow-(--shadow-control) transition-[background-color,color] motion-safe:transition-[max-width] motion-safe:duration-200",
					tone
				)}
				count={count}
			>
				<ActivityStatusIcon status={shown.status} className="size-3.5 text-current" />
				<span className="max-w-0 truncate opacity-0 transition-[max-width,opacity] duration-200 ease-out group-focus-within/chip:max-w-72 group-focus-within/chip:opacity-100 group-hover/chip:max-w-72 group-hover/chip:opacity-100 motion-reduce:transition-none">
					{words}
				</span>
			</Chip>
		</span>
	);
}
