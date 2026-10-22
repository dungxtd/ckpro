import { CircleAlert, TriangleAlert } from "lucide-react";
import type { Issue } from "@/tauri/api";

export function IssuesPanel({ issues }: { issues: Issue[] }) {
	if (issues.length === 0) return null;
	return (
		<ul className="flex flex-col gap-1.5">
			{issues.map(issue => (
				<li
					key={`${issue.component}-${issue.message}`}
					className="flex gap-2 rounded-md border border-border bg-card p-2 text-sm"
				>
					{issue.severity === "error" ? (
						<CircleAlert className="mt-0.5 size-4 shrink-0 text-red-500" />
					) : (
						<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
					)}
					<div>
						<div>{issue.message}</div>
						<div className="text-muted-foreground text-xs">{issue.hint}</div>
					</div>
				</li>
			))}
		</ul>
	);
}
