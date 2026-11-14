import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { ProgressRing } from "@ckpro/ui/components/progress";
import { RowCover } from "@ckpro/ui/components/row-cover";
import { Separator } from "@ckpro/ui/components/separator";
import { Play } from "lucide-react";
import { ModuleCard, ModuleScroll } from "@/components/home/modules/module-card";
import type { suggestion } from "@/components/study/data";
import { PlanPicker } from "@/components/study/plan-picker";
import { PlanRow } from "@/components/study/plan-row";
import { useExam, useExamBusy } from "@/stores/exam";
import type { PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { startLabel } from "@/words";

/**
 * Today's session: the exams planned for today, done ones ticked with their
 * score; Start next starts the next one, and a plan pressed starts once
 * confirmed (`StartPrompt`). Nothing planned: an exam to practise (by rule),
 * pressed the same way, and a way to plan today. While the plans are read,
 * nothing is said; a failed read says so, with Try again
 */
export function Today({
	plans: read,
	failed,
	onRetry,
	today,
	suggested,
	several = false,
}: {
	/** Several exams aimed at: each plan says which */
	several?: boolean;
	/** None while they are being read */
	plans: PlanView[] | null;
	failed: boolean;
	onRetry: () => void;
	today: string;
	suggested: ReturnType<typeof suggestion>;
}) {
	const start = useExam(s => s.start);
	const askStart = useExam(s => s.askStart);
	const busy = useExamBusy();
	const plans = read ?? [];
	// Nothing planned is said only of plans read
	const known = read !== null && !failed;
	const done = plans.filter(p => p.done !== null).length;
	const next = plans.find(p => p.done === null);
	const share = plans.length ? (done * 100) / plans.length : 0;
	return (
		<ModuleCard title="Today" link={{ to: `/calendar?day=${today}`, label: "Calendar" }}>
			<div className="flex shrink-0 items-center gap-4">
				{plans.length > 0 && (
					<ProgressRing
						value={share}
						label={`${done} of ${plans.length} done today`}
						className="size-14"
					>
						<span className="tabular-nums">
							{done}/{plans.length}
						</span>
					</ProgressRing>
				)}
				<div className="min-w-0 flex-1">
					<p className="text-caption text-muted-foreground tabular-nums">
						{failed
							? "Could not read today's plans"
							: read === null
								? // Being read: the line kept, empty, so nothing moves when it comes
									" "
								: plans.length
									? `${done} of ${plans.length} done`
									: "Nothing planned for today"}
					</p>
				</div>
				{/* The summary's action, at its end as actions are */}
				{failed ? (
					<Button size="push" variant="push" className="shrink-0" onClick={onRetry}>
						Try again
					</Button>
				) : next ? (
					// A plan not begun yet: started, in the mode it was planned in
					<Button
						size="push"
						variant="pushDefault"
						className="shrink-0"
						disabled={busy}
						onClick={() => start(next.exam_id, next.mode)}
					>
						<Play /> Start next
					</Button>
				) : (
					known &&
					!plans.length && (
						<PlanPicker day={today}>
							<Button size="push" variant="push" className="shrink-0">
								Plan today
							</Button>
						</PlanPicker>
					)
				)}
			</div>
			{known && !plans.length && suggested && (
				<Card
					variant="dashed"
					padding="sm"
					className="relative mt-3 flex items-center gap-3 hover:bg-hover"
				>
					<RowCover
						aria-label={`${startLabel("practice")}: ${shortTitle(suggested.exam.title)}`}
						disabled={busy}
						onClick={() => askStart(suggested.exam.id, "practice", suggested.exam.title)}
					/>
					<div className="min-w-0 flex-1">
						<div className="truncate font-semibold text-callout">
							{shortTitle(suggested.exam.title)}
						</div>
						<div className="text-2xs text-muted-foreground">Suggested: {suggested.reason}</div>
					</div>
				</Card>
			)}
			{/* The plans below the summary: one line between, none between them */}
			{plans.length > 0 && <Separator className="mt-3" />}
			<ModuleScroll className="mt-1">
				{plans.map(p => (
					<PlanRow
						key={p.id}
						plan={p}
						// Not done yet: pressed, it starts once confirmed
						startable={p.done === null}
						several={several}
						next={p === next}
					/>
				))}
			</ModuleScroll>
		</ModuleCard>
	);
}
