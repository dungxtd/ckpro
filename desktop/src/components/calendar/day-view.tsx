import { Badge } from "@cktry/ui/components/badge";
import { Button } from "@cktry/ui/components/button";
import { CardTitle } from "@cktry/ui/components/card";
import { SectionTitle } from "@cktry/ui/components/section-title";
import { Flag, Play, Plus } from "lucide-react";
import { scoreOf, startedAt } from "@/components/study/data";
import { byDay, dayKey, parseDay } from "@/days";
import { useExam } from "@/stores/exam";
import type { ExamTarget, HistoryEntry, PlanView } from "@/tauri/api";
import { describe } from "./describe";
import { DescribeCard } from "./describe-card";
import { ExamPicker } from "./exam-picker";
import { ModeToggle } from "./mode-toggle";
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
	exam,
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
	/** The exam prepared for: its day flagged */
	exam: ExamTarget | null;
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
		<div className="grid items-start gap-6 @3xl:grid-cols-[272px_minmax(0,1fr)]">
			<div className="max-w-sm @3xl:sticky @3xl:top-0">
				<MiniMonth
					month={new Date(date.getFullYear(), date.getMonth(), 1)}
					days={byDay(history)}
					planned={new Set(plans.filter(p => p.done === null).map(p => p.day))}
					today={today}
					exam={exam?.date ?? null}
					picked={day}
					onPick={onPick}
					onShift={onShift}
				/>
			</div>
			{/* The day a month's or a week's cell opens into, and back (routes/calendar) */}
			<section className="flex min-w-0 flex-col gap-3" data-morph="calendar-day">
				<div className="flex items-center justify-between">
					<CardTitle>{date.toLocaleDateString(undefined, { dateStyle: "full" })}</CardTitle>
					<ExamPicker label={`Plan an exam, ${day}`} onPick={id => onAdd(day, id)}>
						<Button size="push" variant="push">
							<Plus /> Add
						</Button>
					</ExamPicker>
				</div>
				{day === exam?.date && (
					<div className="flex items-center gap-2 rounded-xl bg-highlight px-4 py-3 font-semibold text-highlight-foreground [&_svg]:size-4">
						<Flag /> {exam.certification.toUpperCase()} exam day
					</div>
				)}
				<SectionTitle as="h3" size="group">
					{day < today && open.length ? "Planned, missed" : "Planned"}
				</SectionTitle>
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
								<ModeToggle plan={p} onMode={onMode} className="mt-0.5" />
							</div>
							<Button size="sm" variant="outline" onClick={() => onRemove(p)}>
								Remove
							</Button>
							<Button size="push" variant="push" onClick={() => start(p.exam_id, p.mode)}>
								<Play /> Start
							</Button>
						</div>
					))
				)}
				<SectionTitle as="h3" size="group">
					Done
				</SectionTitle>
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
									<span className="whitespace-nowrap tabular-nums">
										{time(startedAt(h))} to {time(h.result.finished_at ?? startedAt(h))}
									</span>
								</div>
							</div>
							<div className="text-right">
								<div className="font-semibold text-xl tabular-nums">{Math.round(scoreOf(h))}%</div>
								<Badge variant={scoreOf(h) >= h.pass_score ? "success" : "destructive"}>
									{scoreOf(h) >= h.pass_score ? "Passed" : "Failed"}
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
