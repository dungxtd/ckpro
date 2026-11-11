import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@ckpro/ui/components/card";
import { dayMarkerVariants } from "@ckpro/ui/components/day-marker";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { cn } from "@ckpro/ui/lib/utils";
import { useNavigate } from "react-router";
import { addDays, dayKey } from "@/days";
import type { PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";

/** This week's plans, day by day; a day opens in the Calendar. Nothing
 * planned: the week faded, and a way to plan it. While they are read, the
 * week faded alone; a failed read says so, with Try again */
export function Week({
	plans: read,
	failed,
	onRetry,
	weekStart,
	restDays,
}: {
	/** None while they are being read */
	plans: PlanView[] | null;
	failed: boolean;
	onRetry: () => void;
	weekStart: Date;
	restDays: number[];
}) {
	const navigate = useNavigate();
	const plans = read ?? [];
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
							"flex min-h-20 flex-col items-stretch gap-1 rounded-xl bg-fill-quiet/50 p-2 text-left outline-none hover:bg-fill-quiet focus-visible:ring-2 focus-visible:ring-ring"
						)}
					>
						{/* Today marked as the Calendar marks it */}
						<span
							className={cn(
								dayMarkerVariants({ today: key === today, size: "sm" }),
								"-ml-1 self-start",
								key !== today && "font-semibold text-muted-foreground"
							)}
						>
							{day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
						</span>
						{list.map(p => (
							<Badge
								key={p.id}
								variant={p.done !== null ? "success" : "planned"}
								className="max-w-full"
							>
								<span className="truncate">{shortTitle(p.title)}</span>
							</Badge>
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
			{plans.length && !failed ? (
				days
			) : failed ? (
				<Placeholder
					sample={days}
					title="Could not read this week's plans"
					action={
						<Button size="push" variant="push" onClick={onRetry}>
							Try again
						</Button>
					}
				/>
			) : read === null ? (
				<Placeholder sample={days} />
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
