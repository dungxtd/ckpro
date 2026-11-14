import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { dayMarkerVariants } from "@ckpro/ui/components/day-marker";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { RowCover } from "@ckpro/ui/components/row-cover";
import { cn } from "@ckpro/ui/lib/utils";
import { Flag, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { scoreOf, startedAt } from "@/components/study/data";
import { addDays, dayKey, parseDay } from "@/days";
import { useExam, useExamBusy } from "@/stores/exam";
import type { ExamTarget, HistoryEntry, Mode, PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { ExamPicker } from "./exam-picker";
import { ModeToggle } from "./mode-toggle";

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

type Item =
	| { kind: "exam"; target: ExamTarget }
	| { kind: "plan"; plan: PlanView }
	| { kind: "done"; attempt: HistoryEntry };

/**
 * One week, as calendars' Upcoming views lay it out: a strip of its days
 * (a dot where something is on, the exam day's in the accent; one picked
 * goes to it), then every day in order with its exam day, its attempts (the
 * score, tinted as on the map) and its plans (taken the other way, removed,
 * started); a day with nothing is Free, with a way to plan it. Today's
 * actions are at hand; another day's under the pointer
 */
export function Agenda({
	week,
	history,
	plans,
	today,
	exams,
	picked,
	several,
	onPick,
	onAdd,
	onMode,
	onRemove,
}: {
	/** The week's Monday */
	week: Date;
	history: HistoryEntry[];
	plans: PlanView[];
	today: string;
	exams: ExamTarget[];
	picked: string;
	/** Several exams aimed at: each line says which */
	several: boolean;
	onPick: (day: string) => void;
	onAdd: (day: string, examId: string, mode: Mode) => void;
	onMode: (plan: PlanView) => void;
	onRemove: (plan: PlanView) => void;
}) {
	const askStart = useExam(s => s.askStart);
	const busy = useExamBusy();
	const list = useRef<HTMLDivElement>(null);
	// The day picked comes into view
	useEffect(() => {
		list.current
			?.querySelector(`[data-agenda-day="${picked}"]`)
			?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [picked]);

	const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(week, i)));
	const itemsOf = (day: string): Item[] => [
		...exams.filter(t => t.date === day).map(target => ({ kind: "exam" as const, target })),
		...history
			.filter(h => dayKey(new Date(startedAt(h))) === day)
			.map(attempt => ({ kind: "done" as const, attempt })),
		...plans
			.filter(p => p.day === day && p.done === null)
			.map(plan => ({ kind: "plan" as const, plan })),
	];
	const byDay = new Map(days.map(d => [d, itemsOf(d)]));
	// Actions at hand on today's lines; another day's under the pointer or with focus
	const quiet = (day: string) =>
		day !== today &&
		"opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100";

	return (
		<div className="flex flex-col gap-2">
			{/* The week's days: a dot where something is on */}
			<div className="grid grid-cols-7 gap-1">
				{days.map(day => {
					const items = byDay.get(day) ?? [];
					const exam = items.some(i => i.kind === "exam");
					const d = parseDay(day);
					return (
						<button
							key={day}
							type="button"
							aria-pressed={day === picked}
							aria-label={d.toLocaleDateString(undefined, { dateStyle: "full" })}
							onClick={() => onPick(day)}
							className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-caption text-muted-foreground hover:bg-hover"
						>
							{d.toLocaleDateString(undefined, { weekday: "short" })}
							<span
								className={dayMarkerVariants({
									today: day === today,
									exam,
									picked: day === picked,
								})}
							>
								{d.getDate()}
							</span>
							<span
								aria-hidden
								className={cn(
									"size-1 rounded-full",
									exam ? "bg-highlight" : items.length ? "bg-muted-foreground" : "bg-transparent"
								)}
							/>
						</button>
					);
				})}
			</div>
			<Card variant="tinted" padding="none" className="overflow-hidden rounded-2xl" ref={list}>
				{days.map(day => {
					const items = byDay.get(day) ?? [];
					const d = parseDay(day);
					const rel = when(day, today);
					return (
						<div
							key={day}
							data-agenda-day={day}
							className={cn(
								"grid grid-cols-[6.5rem_minmax(0,1fr)] border-border border-t first:border-t-0",
								day === picked && "bg-highlight/[0.07]"
							)}
						>
							<div className="py-2.5 pl-4">
								<div
									className={cn(
										"font-semibold text-callout",
										day === today
											? "text-highlight"
											: !items.length && "font-medium text-muted-foreground"
									)}
								>
									{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
								</div>
								{rel && <div className="text-caption text-muted-foreground">{rel}</div>}
							</div>
							<div className="py-1 pr-3">
								{items.length === 0 ? (
									<div className="group/row flex min-h-9 items-center gap-3 rounded-lg px-2">
										<span className="flex-1 text-callout text-muted-foreground">
											{day < today ? "No practice" : "Free"}
										</span>
										{day >= today && (
											<span className={cn(quiet(day))}>
												<ExamPicker
													label={`Plan an exam, ${day}`}
													onPick={(id, mode) => onAdd(day, id, mode)}
												>
													<Button size="push" variant="push">
														<Plus /> Plan
													</Button>
												</ExamPicker>
											</span>
										)}
									</div>
								) : (
									items.map(item => (
										<div
											key={
												item.kind === "plan"
													? `p${item.plan.id}`
													: item.kind === "done"
														? `a${item.attempt.attempt_id}`
														: `e${item.target.certification}`
											}
											className="group/row relative flex min-h-9 items-center gap-3 rounded-lg px-2 hover:bg-hover"
										>
											{item.kind === "exam" ? (
												<>
													<span
														className="size-2.5 shrink-0 rounded-[3px] bg-highlight"
														aria-hidden
													/>
													<span className="flex items-center gap-1.5 font-semibold text-callout text-highlight [&_svg]:size-3.5">
														<Flag /> {item.target.certification.toUpperCase()} exam day
													</span>
												</>
											) : item.kind === "done" ? (
												<>
													<span
														aria-hidden
														className={cn(
															"size-2.5 shrink-0 rounded-[3px]",
															scoreOf(item.attempt) >= item.attempt.pass_score
																? "bg-success"
																: "bg-warning/60"
														)}
													/>
													<span className="min-w-0 flex-1 truncate text-callout">
														{shortTitle(item.attempt.title)}
														<span className="text-muted-foreground">
															{" · "}
															{several && item.attempt.certification
																? `${item.attempt.certification.toUpperCase()} · `
																: ""}
															{item.attempt.mode === "exam" ? "exam" : "practice"}
														</span>
													</span>
													<span
														className={cn(
															"rounded-full px-2 py-0.5 font-semibold text-caption tabular-nums",
															scoreOf(item.attempt) >= item.attempt.pass_score
																? "bg-success/15 text-success"
																: "bg-warning/15 text-warning"
														)}
													>
														{Math.round(scoreOf(item.attempt))}%
													</span>
												</>
											) : (
												<>
													{/* Today's or later: pressed, it starts once confirmed */}
													{day >= today && (
														<RowCover
															aria-label={`${item.plan.mode === "exam" ? "Start exam" : "Start practice"}: ${shortTitle(item.plan.title)}`}
															disabled={busy}
															onClick={() =>
																askStart(item.plan.exam_id, item.plan.mode, item.plan.title)
															}
														/>
													)}
													<span
														aria-hidden
														className="size-2.5 shrink-0 rounded-[3px] ring-[1.5px] ring-muted-foreground/60 ring-inset"
													/>
													<span className="flex min-w-0 flex-1 items-center gap-2 text-callout">
														<span className="truncate">
															{shortTitle(item.plan.title)}
															{several && (
																<span className="text-muted-foreground">
																	{" · "}
																	{item.plan.certification.toUpperCase()}
																</span>
															)}
														</span>
														<ModeToggle plan={item.plan} onMode={onMode} className="relative" />
														{day < today && (
															<span className="text-caption text-muted-foreground">not taken</span>
														)}
													</span>
													<span className={cn("flex items-center gap-1", quiet(day))}>
														<IconButton
															variant="toolbar"
															size="sm"
															aria-label={`Remove ${item.plan.title}`}
															onClick={() => onRemove(item.plan)}
															className="relative"
														>
															<X />
														</IconButton>
													</span>
												</>
											)}
										</div>
									))
								)}
							</div>
						</div>
					);
				})}
			</Card>
		</div>
	);
}
