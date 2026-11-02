import { Button } from "@cktry/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@cktry/ui/components/card";
import { Placeholder } from "@cktry/ui/components/placeholder";
import { cn } from "@cktry/ui/lib/utils";
import { useNavigate } from "react-router";
import { addDays, dayKey } from "@/days";
import type { PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";

/** This week's plans, day by day; a day opens in the Calendar. Nothing
 * planned: the week faded, and a way to plan it */
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
	const days = (
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
	);
	return (
		<Card padding="lg">
			<CardHeader>
				<CardTitle>This week</CardTitle>
				<CardDescription>change it in the Calendar</CardDescription>
			</CardHeader>
			{plans.length ? (
				days
			) : (
				<Placeholder
					sample={days}
					title="Nothing planned this week"
					action={
						<Button
							size="push"
							variant="push"
							onClick={() => navigate(`/calendar?view=week&day=${dayKey(weekStart)}`)}
						>
							Plan the week
						</Button>
					}
				/>
			)}
		</Card>
	);
}
