import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { ProgressRing } from "@ckpro/ui/components/progress";
import { RowCover } from "@ckpro/ui/components/row-cover";
import { cn } from "@ckpro/ui/lib/utils";
import { Check, Play } from "lucide-react";
import { useNavigate } from "react-router";
import { ModuleCard, ModuleScroll } from "@/components/home/modules";
import type { suggestion } from "@/components/study/data";
import { useExam, useExamBusy } from "@/stores/exam";
import type { PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";

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
	const navigate = useNavigate();
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
					{failed ? (
						<Button size="push" variant="push" className="mt-2" onClick={onRetry}>
							Try again
						</Button>
					) : next ? (
						// A plan not begun yet: started, in the mode it was planned in
						<Button
							size="push"
							variant="pushDefault"
							className="mt-2"
							disabled={busy}
							onClick={() => start(next.exam_id, next.mode)}
						>
							<Play /> Start next
						</Button>
					) : (
						known &&
						!plans.length && (
							<Button
								size="push"
								variant="push"
								className="mt-2"
								onClick={() => navigate(`/calendar?day=${today}`)}
							>
								Plan today
							</Button>
						)
					)}
				</div>
			</div>
			{known && !plans.length && suggested && (
				<Card
					variant="dashed"
					padding="sm"
					className="relative mt-3 flex items-center gap-3 hover:bg-hover"
				>
					<RowCover
						aria-label={`Start practice: ${shortTitle(suggested.exam.title)}`}
						disabled={busy}
						onClick={() => askStart(suggested.exam.id, "practice", suggested.exam.title)}
					/>
					<div className="min-w-0 flex-1">
						<div className="truncate font-semibold text-callout">
							{shortTitle(suggested.exam.title)}
						</div>
						<div className="text-2xs text-muted-foreground">Suggested: {suggested.reason}</div>
					</div>
					<Play aria-hidden className="size-4 shrink-0 text-muted-foreground" />
				</Card>
			)}
			<ModuleScroll className="mt-2">
				{plans.map(p => (
					<div
						key={p.id}
						className={cn(
							"relative flex items-center gap-3 border-border border-t py-2",
							p.done === null && "hover:bg-hover"
						)}
					>
						{/* Not done yet: pressed, it starts once confirmed */}
						{p.done === null && (
							<RowCover
								aria-label={`${p.mode === "exam" ? "Start exam" : "Start practice"}: ${shortTitle(p.title)}`}
								disabled={busy}
								onClick={() => askStart(p.exam_id, p.mode, p.title)}
							/>
						)}
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
								{several && `${p.certification.toUpperCase()} · `}
								{p.mode === "exam" ? "Exam" : "Practice"}
								{p.done !== null && <span className="tabular-nums">, {Math.round(p.done)}%</span>}
								{/* What Start next starts */}
								{p === next && <span className="text-highlight"> · Next</span>}
							</div>
						</div>
						{p.done === null && (
							<Play aria-hidden className="size-4 shrink-0 text-muted-foreground" />
						)}
					</div>
				))}
			</ModuleScroll>
		</ModuleCard>
	);
}
