import { cn } from "@ckpro/ui/lib/utils";

export interface DayMarkerOptions {
	/** The exam's day: tinted in the accent */
	exam?: boolean;
	/** Today, or the day chosen: the accent's solid fill */
	picked?: boolean;
}

/**
 * The number of a day in a day's header (24px high, as wide as its text),
 * and what that day is: picked over exam. Classes, for the element that
 * shows it (a day's header button).
 */
export function dayMarkerVariants({ exam, picked }: DayMarkerOptions) {
	return cn(
		"inline-flex h-6 min-w-6 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 text-caption tabular-nums",
		exam && "bg-highlight/20 font-semibold text-highlight",
		picked && "bg-highlight font-semibold text-highlight-foreground"
	);
}
