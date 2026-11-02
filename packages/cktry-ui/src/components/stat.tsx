import { cn } from "@cktry/ui/lib/utils";
import type * as React from "react";

/** Figures side by side on one card, a hairline between them */
export function StatGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"grid auto-cols-fr grid-flow-col divide-x divide-border rounded-xl border border-border bg-card",
				className
			)}
			{...props}
		/>
	);
}

/** One figure, large, and what it counts; `icon` above them */
export function Stat({
	icon,
	value,
	label,
}: {
	icon?: React.ReactNode;
	value: React.ReactNode;
	label: React.ReactNode;
}) {
	return (
		<div className="min-w-0 px-4 py-3 [&>svg]:mb-2 [&>svg]:size-[18px] [&>svg]:text-muted-foreground">
			{icon}
			<div className="truncate font-semibold text-xl tabular-nums">{value}</div>
			<div className="text-caption text-muted-foreground">{label}</div>
		</div>
	);
}
