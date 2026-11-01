import { cn } from "@ckdry/ui/lib/utils";
import { Flag, GripVertical, Plus, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { scoreOf, startedAt } from "@/components/study/data";
import { dayKey, monthWeeks } from "@/days";
import type { ExamTarget, HistoryEntry, PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { describe } from "./describe";
import { DescribeCard } from "./describe-card";
import { ExamPicker } from "./exam-picker";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface GridActions {
	onOpen: (day: string) => void;
	onAdd: (day: string, examId: string) => void;
	onMove: (plan: PlanView, day: string) => void;
	onMode: (plan: PlanView) => void;
	onRemove: (plan: PlanView) => void;
}

/**
 * The month as a grid of weeks, or one week of it grown (the other weeks
 * folding away): each day with its attempts (score, green when passed) and
 * its open plans, dragged by their grip to another day. + adds a plan
 * (Month: on the day, on hover; Week: under the day); a click elsewhere
 * opens the day; resting on a day describes it as kubectl would. The exam
 * day is flagged
 */
export function Grid({
	month,
	week,
	history,
	plans,
	today,
	exam,
	...actions
}: {
	month: Date;
	/** The week shown grown (its Monday), or none for the whole month */
	week: Date | null;
	history: HistoryEntry[];
	plans: PlanView[];
	today: string;
	/** The exam prepared for, flagged on its day */
	exam: ExamTarget | null;
} & GridActions) {
	const [over, setOver] = useState<string | null>(null);
	const dragged = useRef<PlanView | null>(null);
	const [hover, setHover] = useState<{ day: string; rect: DOMRect } | null>(null);
	const timer = useRef<number>(0);
	const grown = week && dayKey(week);
	const rest = (e: React.MouseEvent<HTMLElement>, day: string) => {
		window.clearTimeout(timer.current);
		const rect = e.currentTarget.getBoundingClientRect();
		timer.current = window.setTimeout(() => setHover({ day, rect }), 450);
	};
	const leave = () => {
		window.clearTimeout(timer.current);
		setHover(null);
	};

	return (
		// Leaving the grid puts the description away; only the pointer does that
		// biome-ignore lint/a11y/noStaticElementInteractions: a hover detail, not an action
		<div
			className="relative overflow-hidden rounded-xl border border-border bg-card"
			onMouseLeave={leave}
		>
			<div className={cn("grid grid-cols-7 border-border border-b", week && "hidden")}>
				{WEEKDAYS.map(d => (
					<div key={d} className="px-2 py-1.5 text-caption text-muted-foreground">
						{d}
					</div>
				))}
			</div>
			{monthWeeks(month).map(days => {
				const key = dayKey(days[0]);
				const folded = !!week && key !== grown;
				return (
					// Each week folds with its row going from 1fr to 0fr
					<div
						key={key}
						className={cn(
							"grid transition-[grid-template-rows,opacity] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
							folded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"
						)}
						inert={folded}
					>
						<div className="grid min-h-0 grid-cols-7 overflow-hidden border-border not-first:border-t">
							{days.map(day => {
								const k = dayKey(day);
								const attempts = history.filter(h => dayKey(new Date(startedAt(h))) === k);
								const open = plans.filter(p => p.day === k && p.done === null);
								return (
									// biome-ignore lint/a11y/useSemanticElements: a day holds buttons of its own
									<div
										key={k}
										role="button"
										tabIndex={0}
										aria-label={day.toLocaleDateString(undefined, { dateStyle: "full" })}
										onClick={() => actions.onOpen(k)}
										onKeyDown={e =>
											e.key === "Enter" && e.target === e.currentTarget && actions.onOpen(k)
										}
										onMouseEnter={e => rest(e, k)}
										onDragOver={e => {
											if (!dragged.current) return;
											e.preventDefault();
											setOver(k);
										}}
										onDragLeave={e =>
											!e.currentTarget.contains(e.relatedTarget as Node) &&
											setOver(o => (o === k ? null : o))
										}
										onDrop={e => {
											e.preventDefault();
											const plan = dragged.current;
											dragged.current = null;
											setOver(null);
											if (plan && plan.day !== k) actions.onMove(plan, k);
										}}
										className={cn(
											"group/day flex min-w-0 cursor-pointer flex-col border-border p-1.5 outline-none transition-[min-height,background-color] duration-[380ms] not-first:border-l hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
											week ? "min-h-[420px]" : "min-h-24",
											!week && day.getMonth() !== month.getMonth() && "text-muted-foreground/60",
											k === exam?.date && "bg-highlight/[0.07]",
											over === k && "bg-highlight/15 ring-2 ring-highlight ring-inset"
										)}
									>
										<div className="flex items-center justify-between">
											<span
												className={cn(
													"inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-full px-1.5 text-caption tabular-nums",
													k === today && "bg-highlight font-semibold text-highlight-foreground"
												)}
											>
												{week && (
													<span className={k === today ? "" : "text-muted-foreground"}>
														{WEEKDAYS[(day.getDay() + 6) % 7]}
													</span>
												)}
												{day.getDate()}
											</span>
											{!week && (
												<ExamPicker
													label={`Plan an exam, ${k}`}
													onPick={id => actions.onAdd(k, id)}
												>
													<button
														type="button"
														aria-label={`Plan an exam on ${k}`}
														onClick={e => e.stopPropagation()}
														className="grid size-6 place-items-center rounded-md bg-foreground/10 opacity-0 outline-none hover:bg-highlight hover:text-highlight-foreground focus-visible:opacity-100 group-hover/day:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-3.5"
													>
														<Plus />
													</button>
												</ExamPicker>
											)}
										</div>
										{k === exam?.date && (
											<span
												className={cn(
													"mt-1 flex items-center gap-1 truncate rounded-md bg-highlight px-1.5 py-0.5 font-semibold text-highlight-foreground [&_svg]:size-3 [&_svg]:shrink-0",
													week ? "text-callout" : "text-2xs"
												)}
											>
												<Flag />
												<span className="truncate">{exam.certification.toUpperCase()} exam</span>
											</span>
										)}
										{attempts.map(h => (
											<span
												key={h.attempt_id}
												className={cn(
													"mt-1 truncate rounded-md px-1.5 py-0.5",
													week ? "text-callout" : "text-2xs",
													scoreOf(h) >= h.pass_score
														? "bg-success/15 text-success"
														: "bg-foreground/[0.07] text-muted-foreground"
												)}
											>
												{Math.round(scoreOf(h))}% {shortTitle(h.title)}
											</span>
										))}
										{open.map(p => (
											// biome-ignore lint/a11y/noStaticElementInteractions: its parts are buttons; the row only stops the day's click
											<div
												key={p.id}
												onClick={e => e.stopPropagation()}
												onKeyDown={e => e.stopPropagation()}
												className={cn(
													"group/plan mt-1 flex min-w-0 items-center gap-1 overflow-hidden rounded-md py-0.5 pr-1 pl-0.5 ring-1 ring-inset",
													week ? "text-callout" : "text-2xs",
													// A day gone by without it: missed
													p.day < today
														? "text-muted-foreground ring-border [&>span:nth-child(2)]:line-through"
														: "bg-highlight/10 text-highlight ring-highlight/40"
												)}
											>
												<span
													draggable
													role="img"
													aria-label={`Drag ${p.title} to another day`}
													onDragStart={(e: DragEvent) => {
														dragged.current = p;
														e.dataTransfer.effectAllowed = "move";
														e.dataTransfer.setData("text/plain", String(p.id));
														leave();
													}}
													onDragEnd={() => {
														dragged.current = null;
														setOver(null);
													}}
													className="cursor-grab rounded opacity-70 hover:bg-highlight/20 hover:opacity-100 [&_svg]:size-3"
												>
													<GripVertical />
												</span>
												<span className="min-w-0 flex-1 truncate">{shortTitle(p.title)}</span>
												<button
													type="button"
													aria-label={`${p.title}: take it as ${p.mode === "exam" ? "practice" : "an exam"}`}
													onClick={() => actions.onMode(p)}
													className="shrink-0 rounded bg-highlight/20 px-1 font-bold text-[9px] outline-none hover:bg-highlight/35 focus-visible:ring-1 focus-visible:ring-ring"
												>
													{/* A letter in a narrow calendar, the word in a wide one */}
													<span className="@4xl:hidden">{p.mode === "exam" ? "E" : "P"}</span>
													<span className="hidden @4xl:inline">
														{p.mode === "exam" ? "EXAM" : "PRACTICE"}
													</span>
												</button>
												<button
													type="button"
													aria-label={`Remove ${p.title}`}
													onClick={() => actions.onRemove(p)}
													className="shrink-0 rounded opacity-0 outline-none hover:bg-highlight/20 focus-visible:opacity-100 group-hover/plan:opacity-100 [&_svg]:size-3"
												>
													<X />
												</button>
											</div>
										))}
										{week && (
											<ExamPicker label={`Plan an exam, ${k}`} onPick={id => actions.onAdd(k, id)}>
												<button
													type="button"
													onClick={e => e.stopPropagation()}
													className="mt-1.5 w-full rounded-md border border-border border-dashed px-2 py-1 text-caption text-muted-foreground outline-none hover:border-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
												>
													+ Add
												</button>
											</ExamPicker>
										)}
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
			{hover && (
				<DescribeCard
					lines={describe(hover.day, history, plans, today)}
					className="pointer-events-none fixed z-floating w-[360px] shadow-[var(--shadow-float)]"
					// Beside the day, on the side with room
					style={{
						top: hover.rect.top,
						left:
							hover.rect.right + 368 < window.innerWidth
								? hover.rect.right + 6
								: hover.rect.left - 366,
					}}
				/>
			)}
		</div>
	);
}
