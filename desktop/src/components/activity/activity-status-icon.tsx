import { Spinner } from "@ckpro/ui/components/spinner";
import { cn } from "@ckpro/ui/lib/utils";
import { AlertCircle, CheckCircle2, CircleSlash } from "lucide-react";
import type { Activity } from "@/tauri/api";

/** Running, failed, cancelled or done, the same everywhere an activity is listed. */
export function ActivityStatusIcon({
	status,
	className,
}: {
	status: Activity["status"];
	className?: string;
}) {
	if (status === "running") return <Spinner size="inline" className={className} />;
	if (status === "cancelled")
		return (
			<CircleSlash
				aria-label="Cancelled"
				className={cn("size-4 text-muted-foreground", className)}
			/>
		);
	if (status === "failed")
		return <AlertCircle aria-label="Failed" className={cn("size-4 text-destructive", className)} />;
	return <CheckCircle2 aria-label="Done" className={cn("size-4 text-success", className)} />;
}
