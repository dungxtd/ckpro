import { Alert } from "@ckpro/ui/components/alert";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { Issue } from "@/tauri/api";

export function IssuesPanel({ issues }: { issues: Issue[] }) {
	if (issues.length === 0) return null;
	return (
		<div className="flex flex-col gap-1.5">
			{issues.map(issue => (
				<Alert
					key={`${issue.component}-${issue.message}`}
					variant={issue.severity === "error" ? "destructive" : "warning"}
				>
					{issue.severity === "error" ? <CircleAlert /> : <TriangleAlert />}
					<div>
						<div>{issue.message}</div>
						<div className="text-muted-foreground text-xs">{issue.hint}</div>
					</div>
				</Alert>
			))}
		</div>
	);
}
