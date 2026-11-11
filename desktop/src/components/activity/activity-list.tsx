import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { Disclosure } from "@ckpro/ui/components/disclosure";
import { Placeholder, SampleRows } from "@ckpro/ui/components/placeholder";
import { clock } from "@ckpro/ui/lib/time";
import { cn } from "@ckpro/ui/lib/utils";
import { useEffect, useState } from "react";
import { ActivityProgress } from "@/components/activity/activity-progress";
import { ActivityStatusIcon } from "@/components/activity/activity-status-icon";
import { useActivityList } from "@/stores/activity";
import { envApi } from "@/tauri/api";
import { dateTime } from "@/words";

/** The row of activity `id`, to scroll to */
export const activityRowId = (id: number) => `activity-${id}`;

/** How long a row brought into view is kept there while the page above it
 * fills in (the memory map arrives after the page opens) */
const SETTLE_MS = 4000;

/**
 * Bring the element `id` to the top of its scrolling screen once the log
 * has opened under it, and keep it there while what is above it grows,
 * until the reader scrolls or the page settles. Returns what stops it
 */
function keepInView(id: string): () => void {
	let stopped = false;
	const place = (behavior: ScrollBehavior) =>
		!stopped && document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
	const frame = requestAnimationFrame(() => place("smooth"));
	const screen = document.getElementById(id)?.closest("main");
	const grows = new ResizeObserver(() => place("auto"));
	if (screen?.firstElementChild) grows.observe(screen.firstElementChild);
	const stop = () => {
		stopped = true;
		grows.disconnect();
		for (const event of ["wheel", "touchstart", "keydown", "pointerdown"])
			window.removeEventListener(event, stop);
	};
	// The reader's own scroll wins at once
	for (const event of ["wheel", "touchstart", "keydown", "pointerdown"])
		window.addEventListener(event, stop, { passive: true });
	const settle = setTimeout(stop, SETTLE_MS);
	return () => {
		cancelAnimationFrame(frame);
		clearTimeout(settle);
		stop();
	};
}

/**
 * The last long operations, failures included, each with its log. `focus`
 * opens one and brings it into view (the top bar's chip): again on each new
 * `focusKey`, though the activity is the same
 */
export function ActivityList({ focus, focusKey }: { focus?: number; focusKey?: string }) {
	const list = useActivityList();
	const [open, setOpen] = useState<number | null>(null);
	useEffect(() => {
		if (focus === undefined || focusKey === undefined) return;
		setOpen(focus);
		return keepInView(activityRowId(focus));
	}, [focus, focusKey]);

	if (list.length === 0) {
		return (
			<Placeholder
				sample={<SampleRows rows={2} />}
				title="Nothing yet"
				description="Clusters made and removed, and exams set up, show here with their logs."
			/>
		);
	}
	return (
		<Card padding="none" className="divide-y divide-border overflow-hidden">
			{list.map(a => (
				<Disclosure
					key={a.id}
					id={activityRowId(a.id)}
					className="scroll-mt-4"
					open={open === a.id}
					onOpenChange={o => setOpen(o ? a.id : null)}
					summary={
						<>
							{/* Opened, a running one turns at its step below: one spinner */}
							{open === a.id && a.status === "running" ? (
								<span className="size-4 shrink-0" />
							) : (
								<ActivityStatusIcon status={a.status} />
							)}
							<span
								className={cn(
									"min-w-0 flex-1 truncate",
									a.status === "failed" && "text-destructive"
								)}
							>
								{a.title}
							</span>
							<span className="shrink-0 text-caption text-muted-foreground tabular-nums">
								{dateTime(a.started_at)}
								{a.finished_at && a.started_at && ` · ${clock(a.finished_at - a.started_at)}`}
							</span>
						</>
					}
				>
					<ActivityProgress id={a.id} compact>
						{/* What failed and can go again (the exam images): Try again */}
						{a.status === "failed" && a.retry && (
							<Button size="push" variant="push" onClick={() => envApi.retry()}>
								Try again
							</Button>
						)}
					</ActivityProgress>
				</Disclosure>
			))}
		</Card>
	);
}
