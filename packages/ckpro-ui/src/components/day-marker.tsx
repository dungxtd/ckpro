import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

export interface DayMarkerOptions {
	/** Today: ringed in the accent */
	today?: boolean;
	/** The exam's day: tinted in the accent */
	exam?: boolean;
	/** The day chosen (open in a pane, picked in a picker): the accent's solid fill */
	picked?: boolean;
	/** A day outside the month shown: faded */
	outside?: boolean;
	/** md 32px round (a month's grid) · sm 24px high, as wide as its text (a day's header) */
	size?: "sm" | "md";
}

/**
 * The number of a day in a calendar-like grid, and what that day is. The
 * states stack, the strongest showing: picked over exam over today. For a
 * marker that is itself the button (a picker's day), put these classes on
 * the button.
 */
export function dayMarkerVariants({ today, exam, picked, outside, size = "md" }: DayMarkerOptions) {
	return cn(
		"inline-flex shrink-0 items-center justify-center gap-1 rounded-full text-caption tabular-nums",
		size === "md" ? "size-8" : "h-6 min-w-6 px-1.5",
		outside && "text-muted-foreground/50",
		today && "font-semibold text-highlight ring-1 ring-highlight ring-inset",
		exam && "bg-highlight/20 font-semibold text-highlight",
		picked && "bg-highlight font-semibold text-highlight-foreground"
	);
}

export function DayMarker({
	today,
	exam,
	picked,
	outside,
	size,
	className,
	...props
}: React.ComponentProps<"span"> & DayMarkerOptions) {
	return (
		<span
			className={cn(dayMarkerVariants({ today, exam, picked, outside, size }), className)}
			{...props}
		/>
	);
}
