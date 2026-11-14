import { Button } from "@ckpro/ui/components/button";
import { Progress } from "@ckpro/ui/components/progress";
import { Link } from "react-router";
import { ModuleCard } from "@/components/home/modules/module-card";
import { daysUntil, parseDay } from "@/days";
import type { ExamTarget } from "@/tauri/api";
import { certName, shortDay } from "@/words";

/** How many days to each exam aimed at: the nearest large; several side by
 * side; one with how far the preparation has come */
export function ExamDay({ targets }: { targets: ExamTarget[] }) {
	const now = new Date();
	if (targets.length === 0)
		return (
			<ModuleCard title="Exam day">
				<p className="text-caption text-muted-foreground">
					Set the day of the exam you prepare for
				</p>
				<Button asChild size="push" variant="push" className="mt-auto self-start">
					<Link to="/calendar">Set it in Calendar</Link>
				</Button>
			</ModuleCard>
		);
	if (targets.length > 1)
		return (
			<ModuleCard>
				<div className="grid h-full auto-cols-fr grid-flow-col divide-x divide-border">
					{targets.map(t => (
						<div key={t.certification} className="flex min-w-0 flex-col px-3 first:pl-0 last:pr-0">
							<span className="font-semibold text-title tabular-nums leading-none">
								{Math.max(0, daysUntil(t.date, now))}
							</span>
							<span className="text-caption text-muted-foreground">
								days to <b className="text-foreground">{certName(t.certification)}</b>
							</span>
							<span className="mt-auto truncate text-caption text-muted-foreground">
								{shortDay(parseDay(t.date))}
							</span>
						</div>
					))}
				</div>
			</ModuleCard>
		);
	const t = targets[0];
	const total = Math.max(1, daysUntil(t.date, parseDay(t.started)));
	const done = Math.min(total, Math.max(0, total - daysUntil(t.date, now)));
	const share = Math.round((done * 100) / total);
	return (
		<ModuleCard>
			<div className="flex items-baseline gap-2.5">
				<span className="font-semibold text-title tabular-nums leading-none">
					{Math.max(0, daysUntil(t.date, now))}
				</span>
				<span className="truncate text-caption text-muted-foreground">
					days to <b className="text-foreground">{certName(t.certification)}</b> ·{" "}
					{shortDay(parseDay(t.date))}
				</span>
			</div>
			<div className="mt-auto">
				<Progress value={share} label="The preparation so far" />
				<div className="mt-1.5 flex justify-between text-caption text-muted-foreground tabular-nums">
					<span>
						Day {done} of {total} of your preparation
					</span>
					<span>{share}%</span>
				</div>
			</div>
		</ModuleCard>
	);
}
