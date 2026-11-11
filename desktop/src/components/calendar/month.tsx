import { Card } from "@ckpro/ui/components/card";
import { dayMarkerVariants } from "@ckpro/ui/components/day-marker";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayKey, monthWeeks } from "@/days";
import type { HistoryEntry } from "@/tauri/api";
import { plural } from "@/words";

const WEEKDAYS = monthWeeks(new Date(2026, 9, 1))[0].map(d =>
	d.toLocaleDateString(undefined, { weekday: "short" })
);

/**
 * The month small, beside a day's attempts: days with attempts tinted, the
 * picked one filled, today ringed, the exam day in the highlight colour; its
 * own arrows change the month
 */
export function MiniMonth({
	month,
	days,
	planned,
	today,
	exam,
	picked,
	onPick,
	onShift,
}: {
	month: Date;
	days: Map<string, HistoryEntry[]>;
	/** Days with a plan still open: a dot under them */
	planned: Set<string>;
	today: string;
	/** The exam's day */
	exam: string | null;
	picked: string;
	onPick: (day: string) => void;
	onShift: (by: number) => void;
}) {
	return (
		// The big month folds into it, and back (routes/calendar)
		<Card padding="sm" className="flex flex-col gap-2" data-morph="calendar-month">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-callout">
					{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
				</span>
				<div className="flex">
					<IconButton
						variant="toolbar"
						size="xs"
						aria-label="Previous month"
						onClick={() => onShift(-1)}
					>
						<ChevronLeft />
					</IconButton>
					<IconButton
						variant="toolbar"
						size="xs"
						aria-label="Next month"
						onClick={() => onShift(1)}
					>
						<ChevronRight />
					</IconButton>
				</div>
			</div>
			<div className="grid grid-cols-7 gap-y-1 text-center">
				{WEEKDAYS.map(name => (
					<span key={name} className="text-2xs text-muted-foreground">
						{name.slice(0, 2)}
					</span>
				))}
				{monthWeeks(month)
					.flat()
					.map(day => {
						const key = dayKey(day);
						const count = days.get(key)?.length ?? 0;
						return (
							<button
								key={key}
								type="button"
								aria-pressed={picked === key}
								aria-label={`${day.toLocaleDateString(undefined, { dateStyle: "full" })}: ${plural(count, "attempt")}${key === exam ? ", exam day" : ""}`}
								onClick={() => onPick(key)}
								// A day with attempts tinted; today, the exam's day and the
								// picked one over it, as every calendar marks them
								className={cn(
									"relative mx-auto outline-none transition-colors duration-100 hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
									count > 0 && "bg-fill-quiet font-semibold",
									dayMarkerVariants({
										today: key === today,
										exam: key === exam,
										picked: picked === key,
										outside: day.getMonth() !== month.getMonth(),
									}),
									picked === key && "hover:bg-highlight"
								)}
							>
								{day.getDate()}
								{planned.has(key) && (
									<span
										className="absolute bottom-0.5 size-1 rounded-full bg-highlight"
										aria-hidden
									/>
								)}
							</button>
						);
					})}
			</div>
		</Card>
	);
}
