import { cn } from "@ckpro/ui/lib/utils";
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

/** One figure, large, and what it counts; `icon` above them. `inline`: a
 * smaller figure in a row of them beside a heading (a week's figures);
 * `valueClassName` tints the figure */
export function Stat({
	icon,
	value,
	label,
	size = "card",
	valueClassName,
	className,
	...props
}: Omit<React.ComponentProps<"div">, "children"> & {
	icon?: React.ReactNode;
	value: React.ReactNode;
	label: React.ReactNode;
	size?: "card" | "inline";
	valueClassName?: string;
}) {
	const inline = size === "inline";
	return (
		<div
			className={cn(
				inline
					? "flex min-w-14 flex-col leading-tight"
					: "min-w-0 px-4 py-3 [&>svg]:mb-2 [&>svg]:size-[18px] [&>svg]:text-muted-foreground",
				className
			)}
			{...props}
		>
			{icon}
			<div
				className={cn(
					"font-semibold tabular-nums",
					inline ? "text-lead" : "truncate text-xl",
					valueClassName
				)}
			>
				{value}
			</div>
			<div
				className={cn(
					"text-muted-foreground",
					inline ? "whitespace-nowrap text-2xs" : "text-caption"
				)}
			>
				{label}
			</div>
		</div>
	);
}
