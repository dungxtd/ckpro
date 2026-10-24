import { Card } from "@ckdry/ui/components/card";
import { cn } from "@ckdry/ui/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useActivityList } from "@/stores/activity";
import { ActivityProgress, clock } from "./activity-progress";
import { ActivityStatusIcon } from "./activity-status-icon";

const time = (ms: number) =>
	new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The last long operations, failures included, each with its log. */
export function ActivityList() {
	const list = useActivityList();
	const [open, setOpen] = useState<number | null>(null);

	if (list.length === 0) {
		return <div className="text-muted-foreground text-sm">Nothing yet.</div>;
	}
	return (
		<Card padding="none" className="divide-y divide-border overflow-hidden">
			{list.map(a => {
				const expanded = open === a.id;
				return (
					<div key={a.id}>
						<button
							type="button"
							aria-expanded={expanded}
							className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5"
							onClick={() => setOpen(expanded ? null : a.id)}
						>
							{expanded ? (
								<ChevronDown className="size-3.5" />
							) : (
								<ChevronRight className="size-3.5" />
							)}
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
						</button>
						{expanded && (
							<div className="px-3 py-3">
								<ActivityProgress id={a.id} compact />
							</div>
						)}
					</div>
				);
			})}
		</Card>
	);
}
