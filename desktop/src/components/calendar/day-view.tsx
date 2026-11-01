import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { Play, Plus } from "lucide-react";
import { scoreOf, startedAt } from "@/components/study/data";
import { byDay, dayKey, parseDay } from "@/days";
import { useExam } from "@/stores/exam";
import type { HistoryEntry, PlanView } from "@/tauri/api";
import { describe } from "./describe";
import { DescribeCard } from "./describe-card";
import { ExamPicker } from "./exam-picker";
import { MiniMonth } from "./month";

const time = (ms: number) =>
	new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * One day: the month small beside it (a day with attempts in bold, one with
 * a plan dotted), the day's plans (Start, change, remove) and attempts, and
 * the day described as kubectl would
 */
export function DayView({
	day,
	history,
	plans,
	today,
	onPick,
	onShift,
	onAdd,
	onMode,
	onRemove,
}: {
	day: string;
	history: HistoryEntry[];
	plans: PlanView[];
	today: string;
	onPick: (day: string) => void;
	onShift: (by: number) => void;
	onAdd: (day: string, examId: string) => void;
	onMode: (plan: PlanView) => void;
	onRemove: (plan: PlanView) => void;
}) {
	const start = useExam(s => s.start);
	const date = parseDay(day);
	const onDay = history.filter(h => dayKey(new Date(startedAt(h))) === day);
	const open = plans.filter(p => p.day === day && p.done === null);
	return (
		<div className="grid grid-cols-[272px_minmax(0,1fr)] items-start gap-6">
			<div className="sticky top-0">
				<MiniMonth
					month={new Date(date.getFullYear(), date.getMonth(), 1)}
					days={byDay(history)}
					planned={new Set(plans.filter(p => p.done === null).map(p => p.day))}
					today={today}
					picked={day}
					onPick={onPick}
					onShift={onShift}
				/>
			</div>
			<section className="flex min-w-0 flex-col gap-3">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-lead">
						{date.toLocaleDateString(undefined, { dateStyle: "full" })}
					</h2>
					<ExamPicker label={`Plan an exam, ${day}`} onPick={id => onAdd(day, id)}>
						<Button size="sm">
							<Plus /> Add
						</Button>
					</ExamPicker>
				</div>
				<h3 className="font-semibold text-caption text-muted-foreground">
					{day < today && open.length ? "Planned, missed" : "Planned"}
				</h3>
				{open.length === 0 ? (
					<p className="text-callout text-muted-foreground">Nothing planned.</p>
				) : (
					open.map(p => (
						<div
							key={p.id}
							className="flex items-center gap-3 rounded-xl border border-highlight/45 border-dashed bg-highlight/10 px-4 py-3"
						>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{p.title}</div>
								<button
									type="button"
									onClick={() => onMode(p)}
									className="mt-0.5 rounded bg-highlight/20 px-1.5 font-bold text-[10px] text-highlight outline-none hover:bg-highlight/35 focus-visible:ring-1 focus-visible:ring-ring"
									aria-label={`${p.title}: take it as ${p.mode === "exam" ? "practice" : "an exam"}`}
								>
									{p.mode === "exam" ? "EXAM" : "PRACTICE"}
								</button>
							</div>
							<Button size="sm" variant="outline" onClick={() => onRemove(p)}>
								Remove
							</Button>
							<Button size="sm" onClick={() => start(p.exam_id, p.mode)}>
								<Play /> Start
							</Button>
						</div>
					))
				)}
				<h3 className="font-semibold text-caption text-muted-foreground">Done</h3>
				{onDay.length === 0 ? (
					<p className="text-callout text-muted-foreground">No attempt on this day.</p>
				) : (
					onDay.map(h => (
						<div
							key={h.attempt_id}
							className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3"
						>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{h.title}</div>
								<div className="mt-0.5 flex items-center gap-2 text-caption text-muted-foreground">
									<Badge>{h.mode === "exam" ? "Exam" : "Practice"}</Badge>
									<span className="tabular-nums">
										{time(startedAt(h))} to {time(h.result.finished_at ?? startedAt(h))}
									</span>
								</div>
							</div>
							<div className="text-right">
								<div className="font-semibold text-xl tabular-nums">{Math.round(scoreOf(h))}%</div>
								<Badge variant={scoreOf(h) >= h.pass_score ? "success" : "destructive"}>
									{scoreOf(h) >= h.pass_score ? "Pass" : "Fail"}
								</Badge>
							</div>
						</div>
					))
				)}
				<DescribeCard lines={describe(day, history, plans, today)} className="mt-2" />
			</section>
		</div>
	);
}
