import { Card } from "@ckdry/ui/components/card";
import { cn } from "@ckdry/ui/lib/utils";
import { useNavigate } from "react-router";
import { addDays, dayKey } from "@/days";
import type { PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";

/** This week's plans, day by day; a day opens in the Calendar */
export function Week({
	plans,
	weekStart,
	restDays,
}: {
	plans: PlanView[];
	weekStart: Date;
	restDays: number[];
}) {
	const navigate = useNavigate();
	const today = dayKey(new Date());
	return (
		<Card padding="lg">
			<div className="mb-3 flex items-baseline justify-between">
				<h2 className="font-semibold text-lead">This week</h2>
				<span className="text-caption text-muted-foreground">change it in the Calendar</span>
			</div>
			<div className="grid grid-cols-7 gap-2">
				{Array.from({ length: 7 }, (_, i) => {
					const day = addDays(weekStart, i);
					const key = dayKey(day);
					const list = plans.filter(p => p.day === key);
					return (
						<button
							key={key}
							type="button"
							onClick={() => navigate(`/calendar?view=day&day=${key}`)}
							className={cn(
								"flex min-h-20 flex-col items-stretch gap-1 rounded-xl bg-foreground/[0.03] p-2 text-left outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring",
								key === today && "ring-[1.5px] ring-highlight ring-inset"
							)}
						>
							<span className="font-semibold text-2xs text-muted-foreground">
								{day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
							</span>
							{list.map(p => (
								<span
									key={p.id}
									className={cn(
										"truncate rounded-md px-1.5 py-0.5 text-2xs",
										p.done !== null
											? "bg-success/15 text-success"
											: "bg-highlight/10 text-highlight ring-1 ring-highlight/40 ring-inset"
									)}
								>
									{shortTitle(p.title)}
								</span>
							))}
							{!list.length && restDays.includes(i) && (
								<span className="text-2xs text-muted-foreground">rest</span>
							)}
						</button>
					);
				})}
			</div>
		</Card>
	);
}
