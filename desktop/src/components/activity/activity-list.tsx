import { Button } from "@cktry/ui/components/button";
import { Card } from "@cktry/ui/components/card";
import { Disclosure } from "@cktry/ui/components/disclosure";
import { Placeholder, SampleRows } from "@cktry/ui/components/placeholder";
import { clock } from "@cktry/ui/lib/time";
import { cn } from "@cktry/ui/lib/utils";
import { useState } from "react";
import { ActivityProgress } from "@/components/activity/activity-progress";
import { ActivityStatusIcon } from "@/components/activity/activity-status-icon";
import { useActivityList } from "@/stores/activity";
import { envApi } from "@/tauri/api";

const time = (ms: number) =>
	new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The last long operations, failures included, each with its log. */
export function ActivityList() {
	const list = useActivityList();
	const [open, setOpen] = useState<number | null>(null);

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
							<span className="text-muted-foreground text-xs tabular-nums">
								{time(a.started_at ?? 0)}
								{a.finished_at && ` · ${clock(a.finished_at - (a.started_at ?? 0))}`}
							</span>
						</>
					}
				>
					<ActivityProgress id={a.id} compact>
						{/* What failed and can go again (the exam images): Retry */}
						{a.status === "failed" && a.retry && (
							<Button size="push" variant="push" onClick={() => envApi.retry()}>
								Retry
							</Button>
						)}
					</ActivityProgress>
				</Disclosure>
			))}
		</Card>
	);
}
