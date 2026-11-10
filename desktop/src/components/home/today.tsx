import { Button } from "@ckpro/ui/components/button";
import { Card, CardDescription, CardTitle } from "@ckpro/ui/components/card";
import { ProgressRing } from "@ckpro/ui/components/progress";
import { cn } from "@ckpro/ui/lib/utils";
import { Check, Play } from "lucide-react";
import { useNavigate } from "react-router";
import type { suggestion } from "@/components/study/data";
import { useExam, useExamBusy } from "@/stores/exam";
import type { PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";

/**
 * Today's session: the exams planned for today, done ones ticked with their
 * score; Continue starts the next one. Nothing planned: an exam to practise
 * (by rule), and a way to plan today
 */
export function Today({
	plans,
	today,
	suggested,
}: {
	plans: PlanView[];
	today: string;
	suggested: ReturnType<typeof suggestion>;
}) {
	const start = useExam(s => s.start);
	const busy = useExamBusy();
	const navigate = useNavigate();
	const done = plans.filter(p => p.done !== null).length;
	const next = plans.find(p => p.done === null);
	const share = plans.length ? (done * 100) / plans.length : 0;
	return (
		<Card padding="lg" className="flex flex-col gap-3">
			<div className="flex items-center gap-4">
				{plans.length > 0 && (
					<ProgressRing value={share} label={`${done} of ${plans.length} done today`}>
						{done}/{plans.length}
					</ProgressRing>
				)}
				<div className="min-w-0 flex-1">
					<CardTitle>Today</CardTitle>
					<CardDescription>
						{plans.length ? `${done} of ${plans.length} done` : "Nothing planned for today"}
					</CardDescription>
					{next ? (
						<Button
							size="sm"
							variant="pushDefault"
							className="mt-2 max-w-full"
							disabled={busy}
							onClick={() => start(next.exam_id, next.mode)}
						>
							<Play /> <span className="truncate">Continue: {shortTitle(next.title)}</span>
						</Button>
					) : (
						!plans.length && (
							<Button
								size="push"
								variant="push"
								className="mt-2"
								onClick={() => navigate(`/calendar?view=day&day=${today}`)}
							>
								Plan today
							</Button>
						)
					)}
				</div>
			</div>
			{!plans.length && suggested && (
				<Card variant="dashed" padding="sm" className="flex items-center gap-3">
					<div className="min-w-0 flex-1">
						<div className="truncate font-semibold text-callout">
							{shortTitle(suggested.exam.title)}
						</div>
						<div className="text-2xs text-muted-foreground">Suggested: {suggested.reason}</div>
					</div>
					<Button
						size="push"
						variant="pushDefault"
						disabled={busy}
						onClick={() => start(suggested.exam.id, "practice")}
					>
						<Play /> Start
					</Button>
				</Card>
			)}
			{plans.map(p => (
				<div key={p.id} className="flex items-center gap-3 border-border border-t pt-2.5">
					<span
						className={cn(
							"grid size-[18px] shrink-0 place-items-center rounded-full",
							p.done !== null
								? "bg-success text-success-foreground"
								: "ring-2 ring-muted-foreground ring-inset"
						)}
					>
						{p.done !== null && <Check className="size-3" strokeWidth={3} />}
					</span>
					<div className="min-w-0 flex-1">
						<div
							className={cn(
								"truncate text-callout",
								p.done !== null && "text-muted-foreground line-through"
							)}
						>
							{p.title}
						</div>
						<div className="text-2xs text-muted-foreground">
							{p.mode === "exam" ? "Exam" : "Practice"}
							{p.done !== null && `, ${Math.round(p.done)}%`}
						</div>
					</div>
					{p.done === null && (
						<Button
							size="push"
							variant="push"
							disabled={busy}
							onClick={() => start(p.exam_id, p.mode)}
						>
							<Play /> Start
						</Button>
					)}
				</div>
			))}
		</Card>
	);
}
