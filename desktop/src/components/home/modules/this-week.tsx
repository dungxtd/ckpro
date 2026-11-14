import { cn } from "@ckpro/ui/lib/utils";
import { ModuleCard } from "@/components/home/modules/module-card";
import { addDays, dayKey, parseDay, weekRange } from "@/days";
import type { PlanView } from "@/tauri/api";
import { plural } from "@/words";

/** A day's bar reaches the top at this many minutes, or the week's most */
const BAR_FULL = 60;
/** The least a practised day's bar shows, % of the height, and an empty
 * day's stub, px */
const BAR_LEAST = 12;
const BAR_EMPTY = 6;

/** This week in figures: time, attempts, and each day's time against the plans */
export function ThisWeek({
	minutes,
	attempts,
	plans,
	weekStart,
}: {
	minutes: Map<string, number>;
	attempts: number;
	plans: PlanView[] | null;
	weekStart: Date;
}) {
	const today = dayKey(new Date());
	const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)));
	const total = days.reduce((n, d) => n + (minutes.get(d) ?? 0), 0);
	const most = Math.max(BAR_FULL, ...days.map(d => minutes.get(d) ?? 0));
	const planned = new Set((plans ?? []).filter(p => p.done === null).map(p => p.day));
	return (
		<ModuleCard
			title={
				<>
					This week{" "}
					<span className="font-normal text-muted-foreground">{weekRange(parseDay(days[0]))}</span>
				</>
			}
			link={{ to: `/calendar?day=${days[0]}`, label: "Calendar" }}
		>
			<div className="flex min-h-0 flex-1 items-end justify-between gap-4">
				<div className="flex flex-col">
					<span className="font-semibold text-title tabular-nums leading-none">
						{(total / 60).toFixed(1)}
					</span>
					<span className="text-caption text-muted-foreground">
						hours · {plural(attempts, "attempt")}
					</span>
				</div>
				<div
					className="flex h-full items-end gap-1.5"
					role="img"
					aria-label={`${Math.round(total)} minutes practised this week`}
				>
					{days.map(d => {
						const m = minutes.get(d) ?? 0;
						return (
							<span
								key={d}
								className="flex h-full w-5 flex-col items-center justify-end gap-1 text-3xs text-muted-foreground"
							>
								<i
									className={cn(
										"w-full rounded-xs",
										m
											? "bg-success"
											: planned.has(d) && d >= today
												? "ring-[1.5px] ring-highlight ring-inset"
												: "bg-fill-quiet"
									)}
									style={{ height: m ? `${Math.max(BAR_LEAST, (m * 100) / most)}%` : BAR_EMPTY }}
								/>
								{parseDay(d).toLocaleDateString(undefined, { weekday: "narrow" })}
							</span>
						);
					})}
				</div>
			</div>
		</ModuleCard>
	);
}
