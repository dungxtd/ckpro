import { cn } from "@ckdry/ui/lib/utils";
import { shortTitle } from "@/components/catalog/exams";
import type { HistoryEntry } from "@/tauri/api";
import { dayKey, monthWeeks } from "./days";

const WEEKDAYS = monthWeeks(new Date(2026, 9, 1))[0].map(d =>
	d.toLocaleDateString(undefined, { weekday: "short" })
);

/**
 * A month of study: each day with the attempts started on it (two named,
 * then how many more). Days of the next and last month are faint
 */
export function Month({
	month,
	days,
	today,
	picked,
	onPick,
}: {
	month: Date;
	days: Map<string, HistoryEntry[]>;
	today: string;
	picked: string | null;
	onPick: (day: string) => void;
}) {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="grid grid-cols-7 border-border border-b">
				{WEEKDAYS.map(name => (
					<div key={name} className="px-2 py-1.5 text-caption text-muted-foreground">
						{name}
					</div>
				))}
			</div>
			{monthWeeks(month).map(week => (
				<div key={dayKey(week[0])} className="grid grid-cols-7 border-border not-last:border-b">
					{week.map(day => {
						const key = dayKey(day);
						const attempts = days.get(key) ?? [];
						const inMonth = day.getMonth() === month.getMonth();
						return (
							<button
								key={key}
								type="button"
								aria-pressed={picked === key}
								aria-label={`${day.toLocaleDateString(undefined, { dateStyle: "full" })}: ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`}
								onClick={() => onPick(key)}
								className={cn(
									"flex min-h-24 min-w-0 flex-col gap-1 border-border p-1.5 text-left outline-none not-last:border-r hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-pressed:bg-sidebar-selected",
									!inMonth && "text-muted-foreground/60"
								)}
							>
								<span
									className={cn(
										"grid size-6 place-items-center rounded-full text-caption tabular-nums",
										key === today && "bg-highlight font-semibold text-highlight-foreground"
									)}
								>
									{day.getDate()}
								</span>
								{attempts.slice(0, 2).map(h => (
									<span
										key={h.attempt_id}
										className={cn(
											"truncate rounded px-1 py-px text-2xs",
											h.result.passed ? "bg-success/15 text-success" : "bg-foreground/[0.07]"
										)}
									>
										{h.result.score ?? 0}% {shortTitle(h.title)}
									</span>
								))}
								{attempts.length > 2 && (
									<span className="px-1 text-2xs text-muted-foreground">
										{attempts.length - 2} more
									</span>
								)}
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}
