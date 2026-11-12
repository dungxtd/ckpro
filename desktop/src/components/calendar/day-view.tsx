import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { Flag, Play, Plus } from "lucide-react";
import { scoreOf, startedAt } from "@/components/study/data";
import { dayKey, parseDay } from "@/days";
import { useExam, useExamBusy } from "@/stores/exam";
import type { ExamTarget, HistoryEntry, PlanView } from "@/tauri/api";
import { ExamPicker } from "./exam-picker";
import { ModeToggle } from "./mode-toggle";

const time = (ms: number) =>
	new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * One day, as the practice map or the week opens it: the exam days on it,
 * its plans (Start, change, remove; one added) and its attempts
 */
export function DayView({
	day,
	history,
	plans,
	today,
	exams,
	onAdd,
	onMode,
	onRemove,
}: {
	day: string;
	history: HistoryEntry[];
	plans: PlanView[];
	today: string;
	/** The exams aimed at: their days flagged */
	exams: ExamTarget[];
	onAdd: (day: string, examId: string) => void;
	onMode: (plan: PlanView) => void;
	onRemove: (plan: PlanView) => void;
}) {
	const start = useExam(s => s.start);
	const busy = useExamBusy();
	const date = parseDay(day);
	const onDay = history.filter(h => dayKey(new Date(startedAt(h))) === day);
	const open = plans.filter(p => p.day === day && p.done === null);
	const days = Math.round((date.getTime() - parseDay(today).getTime()) / 86_400_000);
	const when =
		days === 0
			? "today"
			: days === 1
				? "tomorrow"
				: days === -1
					? "yesterday"
					: days < 0
						? `${-days} days ago`
						: `in ${days} days`;
	const examsOn = exams.filter(e => e.date === day);
	const empty = open.length === 0 && onDay.length === 0 && examsOn.length === 0;
	return (
		<Card variant="tinted" padding="md" className="flex flex-col gap-1 rounded-2xl">
			<div className="mb-1 flex items-baseline gap-2">
				<h2 className="font-semibold text-callout">
					{date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
				</h2>
				<span className="text-caption text-muted-foreground">{when}</span>
				<span className="flex-1" />
				<ExamPicker label={`Plan an exam, ${day}`} onPick={id => onAdd(day, id)}>
					<Button size="push" variant="push">
						<Plus /> Add
					</Button>
				</ExamPicker>
			</div>
			{examsOn.map(e => (
				<div
					key={e.certification}
					className="flex items-center gap-2 rounded-xl bg-highlight px-3 py-2 font-semibold text-callout text-highlight-foreground [&_svg]:size-4"
				>
					<Flag /> {e.certification.toUpperCase()} exam day
				</div>
			))}
			{empty && (
				<p className="py-2 text-callout text-muted-foreground">
					{day < today
						? "No practice this day."
						: "Free: plan an exam with Add, or keep it for rest."}
				</p>
			)}
			{/* Planned first (ringed, as on the map), then what was done (its score) */}
			{open.map(p => (
				<div
					key={p.id}
					className="flex items-center gap-3 border-border border-t py-2 first:border-0"
				>
					<span
						className="size-3 shrink-0 rounded-[3px] ring-[1.5px] ring-highlight ring-inset"
						aria-hidden
					/>
					<div className="min-w-0 flex-1">
						<div className="truncate text-callout">{p.title}</div>
						<div className="flex items-center gap-1.5 text-caption text-muted-foreground">
							{day < today ? "Planned, not taken" : "Planned"} ·
							<ModeToggle plan={p} onMode={onMode} />
						</div>
					</div>
					{day >= today && (
						<Button
							size="push"
							variant="pushDefault"
							disabled={busy}
							onClick={() => start(p.exam_id, p.mode)}
						>
							<Play /> Start
						</Button>
					)}
					<Button
						size="push"
						variant="push"
						aria-label={`Remove ${p.title}`}
						onClick={() => onRemove(p)}
					>
						Remove
					</Button>
				</div>
			))}
			{onDay.map(h => {
				const passed = scoreOf(h) >= h.pass_score;
				return (
					<div
						key={h.attempt_id}
						className="flex items-center gap-3 border-border border-t py-2 first:border-0"
					>
						<span
							className={`size-3 shrink-0 rounded-[3px] ${passed ? "bg-success" : "bg-warning/60"}`}
							aria-hidden
						/>
						<div className="min-w-0 flex-1">
							<div className="truncate text-callout">{h.title}</div>
							<div className="text-caption text-muted-foreground tabular-nums">
								{h.mode === "exam" ? "Exam" : "Practice"} · {time(startedAt(h))}–
								{time(h.result.finished_at ?? startedAt(h))}
							</div>
						</div>
						<Badge variant={passed ? "success" : "warning"}>
							{Math.round(scoreOf(h))}% {passed ? "passed" : "below the pass line"}
						</Badge>
					</div>
				);
			})}
		</Card>
	);
}
