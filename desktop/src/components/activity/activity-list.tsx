import { cn } from "@ckdry/ui/lib/utils";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useActivityList } from "@/stores/activity";
import { ActivityProgress, clock } from "./activity-progress";

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
		<ul className="flex flex-col divide-y divide-border rounded-md border border-border">
			{list.map(a => {
				const expanded = open === a.id;
				return (
					<li key={a.id}>
						<button
							type="button"
							className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
							onClick={() => setOpen(expanded ? null : a.id)}
						>
							{expanded ? (
								<ChevronDown className="size-3.5" />
							) : (
								<ChevronRight className="size-3.5" />
							)}
							{a.status === "running" ? (
								<Loader2 className="size-4 animate-spin text-primary" />
							) : a.status === "failed" ? (
								<AlertCircle className="size-4 text-red-500" />
							) : (
								<CheckCircle2 className="size-4 text-emerald-500" />
							)}
							<span
								className={cn("min-w-0 flex-1 truncate", a.status === "failed" && "text-red-500")}
							>
								{a.title}
							</span>
							<span className="text-muted-foreground text-xs tabular-nums">
								{time(a.started_at ?? 0)}
								{a.finished_at && ` · ${clock(a.finished_at - (a.started_at ?? 0))}`}
							</span>
						</button>
						{expanded && (
							<div className="border-border border-t px-3 py-3">
								<ActivityProgress id={a.id} compact />
							</div>
						)}
					</li>
				);
			})}
		</ul>
	);
}
