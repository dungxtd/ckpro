import { IconButton } from "@ckdry/ui/components/icon-button";
import { cn } from "@ckdry/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayKey, monthWeeks } from "@/days";
import type { HistoryEntry } from "@/tauri/api";

const WEEKDAYS = monthWeeks(new Date(2026, 9, 1))[0].map(d =>
	d.toLocaleDateString(undefined, { weekday: "short" })
);

/**
 * The month small, beside a day's attempts: days with attempts tinted, the
 * picked one filled, today ringed; its own arrows change the month
 */
export function MiniMonth({
	month,
	days,
	planned,
	today,
	picked,
	onPick,
	onShift,
}: {
	month: Date;
	days: Map<string, HistoryEntry[]>;
	/** Days with a plan still open: a dot under them */
	planned: Set<string>;
	today: string;
	picked: string;
	onPick: (day: string) => void;
	onShift: (by: number) => void;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
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
								aria-label={`${day.toLocaleDateString(undefined, { dateStyle: "full" })}: ${count} attempt${count === 1 ? "" : "s"}`}
								onClick={() => onPick(key)}
								className={cn(
									"relative mx-auto grid size-8 place-items-center rounded-full text-caption tabular-nums outline-none transition-colors duration-150 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
									day.getMonth() !== month.getMonth() && "text-muted-foreground/50",
									count > 0 && "bg-foreground/[0.08] font-semibold",
									key === today && "ring-1 ring-highlight",
									picked === key && "bg-highlight text-highlight-foreground hover:bg-highlight"
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
		</div>
	);
}
