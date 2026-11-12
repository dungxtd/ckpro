import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { cn } from "@ckpro/ui/lib/utils";
import { Flag, Play, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { scoreOf, startedAt } from "@/components/study/data";
import { addDays, dayKey, monday, parseDay } from "@/days";
import { useExam, useExamBusy } from "@/stores/exam";
import type { ExamTarget, HistoryEntry, PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { ExamPicker } from "./exam-picker";
import { ModeToggle } from "./mode-toggle";

/** How many weeks the agenda runs, from the week picked */
export const AGENDA_WEEKS = 6;

const when = (day: string, today: string) => {
	const n = Math.round((parseDay(day).getTime() - parseDay(today).getTime()) / 86_400_000);
	return n === 0
		? "today"
		: n === 1
			? "tomorrow"
			: n === -1
				? "yesterday"
				: n < 0
					? `${-n} days ago`
					: null;
};
const weekName = (start: Date, today: string) => {
	const diff = Math.round((start.getTime() - monday(parseDay(today)).getTime()) / (7 * 86_400_000));
	const span = `${start.getDate()} – ${addDays(start, 6).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
	return diff === 0
		? ["This week", span]
		: diff === 1
			? ["Next week", span]
			: diff === -1
				? ["Last week", span]
				: [span, ""];
};

type Line =
	| { kind: "exam"; day: string; target: ExamTarget }
	| { kind: "plan"; day: string; plan: PlanView }
	| { kind: "done"; day: string; attempt: HistoryEntry }
	| { kind: "free"; day: string };

/**
 * The weeks from the one picked, as an agenda: a line for each exam day,
 * each plan (taken the other way, removed, started) and each attempt (its
 * score); today keeps a line even when nothing is on it, and a week with
 * nothing planned says so with a way to plan it. The day picked on the map
 * is scrolled to and tinted
 */
export function Agenda({
	from,
	history,
	plans,
	today,
	exams,
	picked,
	restDays,
	several,
	onAdd,
	onMode,
	onRemove,
}: {
	/** The first week's Monday */
	from: Date;
	history: HistoryEntry[];
	plans: PlanView[];
	today: string;
	exams: ExamTarget[];
	picked: string;
	/** Days of the week kept free (0 Monday) */
	restDays: number[];
	/** Several exams aimed at: each line says which */
	several: boolean;
	onAdd: (day: string, examId: string) => void;
	onMode: (plan: PlanView) => void;
	onRemove: (plan: PlanView) => void;
}) {
	const start = useExam(s => s.start);
	const busy = useExamBusy();
	const list = useRef<HTMLDivElement>(null);
	// The day picked comes into view
	useEffect(() => {
		list.current
			?.querySelector(`[data-agenda-day="${picked}"]`)
			?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [picked]);

	const weeks = Array.from({ length: AGENDA_WEEKS }, (_, w) => addDays(from, 7 * w));
	return (
		<Card variant="tinted" padding="none" className="overflow-hidden rounded-2xl" ref={list}>
			{weeks.map(week => {
				const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(week, i)));
				const lines: Line[] = days.flatMap(day => {
					const out: Line[] = [
						...exams
							.filter(t => t.date === day)
							.map(target => ({ kind: "exam" as const, day, target })),
						...history
							.filter(h => dayKey(new Date(startedAt(h))) === day)
							.map(attempt => ({ kind: "done" as const, day, attempt })),
						...plans
							.filter(p => p.day === day && p.done === null)
							.map(plan => ({ kind: "plan" as const, day, plan })),
					];
					return out.length === 0 && day === today ? [{ kind: "free" as const, day }] : out;
				});
				const [name, span] = weekName(week, today);
				// A week with nothing: planned on its first day kept for study, from today
				const freeDay = days.find(
					d => d >= today && !restDays.includes((parseDay(d).getDay() + 6) % 7)
				);
				return (
					<section key={days[0]}>
						<div className="sticky top-0 z-[1] flex items-baseline gap-2 border-border border-b bg-fill-quiet px-4 py-2 backdrop-blur-md">
							<span className="font-semibold text-callout">{name}</span>
							<span className="text-caption text-muted-foreground">{span}</span>
						</div>
						{lines.length === 0 ? (
							<div className="flex items-center gap-3 px-4 py-3 text-callout text-muted-foreground">
								<span className="flex-1">Nothing planned</span>
								{freeDay && (
									<ExamPicker label={`Plan an exam, ${freeDay}`} onPick={id => onAdd(freeDay, id)}>
										<Button size="push" variant="push">
											<Plus /> Plan the week
										</Button>
									</ExamPicker>
								)}
							</div>
						) : (
							lines.map((line, i) => {
								const first = i === 0 || lines[i - 1].day !== line.day;
								const d = parseDay(line.day);
								const key =
									line.kind === "plan"
										? `p${line.plan.id}`
										: line.kind === "done"
											? `a${line.attempt.attempt_id}`
											: `${line.kind}${line.day}`;
								return (
									<div
										key={key}
										data-agenda-day={first ? line.day : undefined}
										className={cn(
											"group/line grid min-h-11 grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 border-border border-t px-4 py-1.5 first:border-t-0 hover:bg-hover",
											line.day === picked && "bg-highlight/[0.08]"
										)}
									>
										<span className={cn("text-callout", !first && "invisible")}>
											<b className={cn("font-semibold", line.day === today && "text-highlight")}>
												{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
											</b>
											{when(line.day, today) && (
												<span className="ml-1.5 text-caption text-muted-foreground">
													{when(line.day, today)}
												</span>
											)}
										</span>
										{line.kind === "exam" ? (
											<>
												<span className="flex items-center gap-2 font-semibold text-callout text-highlight [&_svg]:size-3.5">
													<Flag /> {line.target.certification.toUpperCase()} exam day
												</span>
												<span />
											</>
										) : line.kind === "free" ? (
											<>
												<span className="text-callout text-muted-foreground">Nothing planned</span>
												<ExamPicker
													label={`Plan an exam, ${line.day}`}
													onPick={id => onAdd(line.day, id)}
												>
													<Button size="push" variant="push">
														<Plus /> Plan
													</Button>
												</ExamPicker>
											</>
										) : line.kind === "done" ? (
											<>
												<span className="truncate text-callout">
													{shortTitle(line.attempt.title)}
													<span className="text-muted-foreground">
														{" · "}
														{several && line.attempt.certification
															? `${line.attempt.certification.toUpperCase()} · `
															: ""}
														{line.attempt.mode === "exam" ? "exam" : "practice"}
													</span>
												</span>
												<span
													className={cn(
														"rounded-full px-2 py-0.5 font-semibold text-caption tabular-nums",
														scoreOf(line.attempt) >= line.attempt.pass_score
															? "bg-success/15 text-success"
															: "bg-warning/15 text-warning"
													)}
												>
													{Math.round(scoreOf(line.attempt))}%
												</span>
											</>
										) : (
											<>
												<span className="flex min-w-0 items-center gap-2 text-callout">
													<span className="truncate">
														{shortTitle(line.plan.title)}
														{several && (
															<span className="text-muted-foreground">
																{" · "}
																{line.plan.certification.toUpperCase()}
															</span>
														)}
													</span>
													<ModeToggle plan={line.plan} onMode={onMode} />
													{line.day < today && (
														<span className="text-caption text-muted-foreground">not taken</span>
													)}
												</span>
												{/* Today's at hand; the others' under the pointer or with focus */}
												<span
													className={cn(
														"flex items-center gap-1",
														line.day !== today &&
															"opacity-0 transition-opacity group-focus-within/line:opacity-100 group-hover/line:opacity-100"
													)}
												>
													{line.day >= today && (
														<Button
															size="push"
															variant={line.day === today ? "pushDefault" : "push"}
															disabled={busy}
															onClick={() => start(line.plan.exam_id, line.plan.mode)}
														>
															<Play /> Start
														</Button>
													)}
													<IconButton
														variant="toolbar"
														size="sm"
														aria-label={`Remove ${line.plan.title}`}
														onClick={() => onRemove(line.plan)}
													>
														<X />
													</IconButton>
												</span>
											</>
										)}
									</div>
								);
							})
						)}
					</section>
				);
			})}
		</Card>
	);
}
