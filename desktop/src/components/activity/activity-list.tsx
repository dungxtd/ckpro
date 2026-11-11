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
		// Once the log has opened under it
		const id = requestAnimationFrame(() =>
			document
				.getElementById(activityRowId(focus))
				?.scrollIntoView({ behavior: "smooth", block: "start" })
		);
		return () => cancelAnimationFrame(id);
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
							<ActivityStatusIcon status={a.status} />
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
