import { HoverCard, HoverCardContent, HoverCardTrigger } from "@cktry/ui/components/hover-card";
import { useElementSize } from "@cktry/ui/hooks/use-element-size";
import { cn } from "@cktry/ui/lib/utils";
import { Flag, GripVertical, Plus, X } from "lucide-react";
import { type DragEvent, useState } from "react";
import { scoreOf, startedAt } from "@/components/study/data";
import { dayKey, monthWeeks } from "@/days";
import type { ExamTarget, HistoryEntry, PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { describe } from "./describe";
import { DescribeCard } from "./describe-card";
import { ExamPicker } from "./exam-picker";
import { ModeToggle } from "./mode-toggle";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** A day's number and padding, a thing listed under it, and the "+N more"
 * line, in px: how many things a month's row holds */
const DAY_HEAD = 36;
const DAY_ITEM = 24;
const DAY_MORE = 18;

export interface GridActions {
	onOpen: (day: string) => void;
	onAdd: (day: string, examId: string) => void;
	onMove: (plan: PlanView, day: string) => void;
	onMode: (plan: PlanView) => void;
	onRemove: (plan: PlanView) => void;
}

/** Dragging a plan between days: the plan, and the day it is over */
interface Drag {
	plan: PlanView | null;
	over: string | null;
}

/**
 * The month as a grid of weeks filling the height it is given, or one week
 * of it grown (the other weeks folding away): each day with its attempts
 * (score, green when passed) and its open plans, dragged by their grip to
 * another day; the exam day flagged. + on the day (on hover) adds a plan, a
 * click elsewhere opens the day, resting on it describes it as kubectl would
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
	const [drag, setDrag] = useState<Drag>({ plan: null, over: null });
	const grown = week && dayKey(week);
	// The six rows share the frame's height under the weekday names (a row's
	// own height is the grown week's in Week, or folding between)
	const [frame, frameSize] = useElementSize<HTMLDivElement>();
	const [names, namesSize] = useElementSize<HTMLDivElement>();
	const row = frameSize.height ? (frameSize.height - namesSize.height) / 6 : 112;
	const fits = {
		all: Math.floor((row - DAY_HEAD) / DAY_ITEM),
		withMore: Math.max(0, Math.floor((row - DAY_HEAD - DAY_MORE) / DAY_ITEM)),
	};

	return (
		<div
			ref={frame}
			// The month folds into the Day view's small month, and back (routes/calendar)
			data-morph={week ? undefined : "calendar-month"}
			className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card"
		>
			<div ref={names} className={cn("grid grid-cols-7 border-border border-b", week && "hidden")}>
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
					// Each week folds with its row going from 1fr to 0fr; the weeks share
					// the height, a folded one gives its share up (a short window
					// scrolls rather than squeezing a week)
					<div
						key={key}
						inert={folded}
						className={cn(
							"grid transition-[grid-template-rows,flex-grow,opacity] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
							folded
								? "min-h-0 flex-[0_1_0px] grid-rows-[0fr] opacity-0"
								: cn(
										// A line between weeks (the weekday names come first)
										"flex-[1_1_0px] grid-rows-[1fr] border-border [&:not(:nth-child(2))]:border-t",
										week ? "min-h-60" : "min-h-[4.5rem]"
									)
						)}
					>
						<div className="grid h-full min-h-0 grid-cols-7 overflow-hidden">
							{days.map(day => (
								<Day
									key={dayKey(day)}
									day={day}
									month={month}
									grown={!!week}
									fits={fits}
									today={today}
									exam={exam}
									attempts={history.filter(h => dayKey(new Date(startedAt(h))) === dayKey(day))}
									plans={plans.filter(p => p.day === dayKey(day) && p.done === null)}
									drag={drag}
									onDrag={setDrag}
									describe={() => describe(dayKey(day), history, plans, today)}
									{...actions}
								/>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/** One day of the grid: its number, + to plan, what it holds, and its
 * description on a rest */
function Day({
	day,
	month,
	grown,
	fits,
	today,
	exam,
	attempts,
	plans,
	drag,
	onDrag,
	describe: lines,
	...actions
}: {
	day: Date;
	month: Date;
	/** In the grown week: everything listed, the weekday named */
	grown: boolean;
	fits: { all: number; withMore: number };
	today: string;
	exam: ExamTarget | null;
	attempts: HistoryEntry[];
	/** Its open plans */
	plans: PlanView[];
	drag: Drag;
	onDrag: (drag: Drag) => void;
	describe: () => ReturnType<typeof describe>;
} & GridActions) {
	const k = dayKey(day);
	const examDay = k === exam?.date;
	// A month's day keeps its height: the first things, then how many more
	// (the grown week lists them all, the description too)
	const total = (examDay ? 1 : 0) + attempts.length + plans.length;
	const room = grown || total <= fits.all ? total : fits.withMore;
	const shownAttempts = attempts.slice(0, Math.max(0, room - (examDay ? 1 : 0)));
	const shownPlans = plans.slice(0, Math.max(0, room - (examDay ? 1 : 0) - shownAttempts.length));
	const size = grown ? "text-callout" : "text-2xs";

	return (
		// Closed while a plan is dragged: the grid is the drop target then
		<HoverCard open={drag.plan ? false : undefined}>
			<HoverCardTrigger asChild>
				{/* biome-ignore lint/a11y/useSemanticElements: a day holds buttons of its own */}
				<div
					role="button"
					tabIndex={0}
					data-day={k}
					aria-label={day.toLocaleDateString(undefined, { dateStyle: "full" })}
					onClick={() => actions.onOpen(k)}
					onKeyDown={e => e.key === "Enter" && e.target === e.currentTarget && actions.onOpen(k)}
					onDragOver={e => {
						if (!drag.plan) return;
						e.preventDefault();
						if (drag.over !== k) onDrag({ ...drag, over: k });
					}}
					onDragLeave={e =>
						!e.currentTarget.contains(e.relatedTarget as Node) &&
						drag.over === k &&
						onDrag({ ...drag, over: null })
					}
					onDrop={e => {
						e.preventDefault();
						if (drag.plan && drag.plan.day !== k) actions.onMove(drag.plan, k);
						onDrag({ plan: null, over: null });
					}}
					className={cn(
						"group/day flex min-w-0 cursor-pointer flex-col border-border p-1.5 outline-none transition-colors duration-[380ms] not-first:border-l hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
						!grown && "overflow-hidden",
						!grown && day.getMonth() !== month.getMonth() && "text-muted-foreground/60",
						examDay && "bg-highlight/[0.07]",
						drag.over === k && "bg-highlight/15 ring-2 ring-highlight ring-inset"
					)}
				>
					<div className="flex items-center justify-between">
						<span
							className={cn(
								"inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-full px-1.5 text-caption tabular-nums",
								k === today && "bg-highlight font-semibold text-highlight-foreground"
							)}
						>
							{grown && (
								<span className={k === today ? "" : "text-muted-foreground"}>
									{WEEKDAYS[(day.getDay() + 6) % 7]}
								</span>
							)}
							{day.getDate()}
						</span>
						<ExamPicker label={`Plan an exam, ${k}`} onPick={id => actions.onAdd(k, id)}>
							<button
								type="button"
								aria-label={`Plan an exam on ${k}`}
								onClick={e => e.stopPropagation()}
								className="grid size-6 place-items-center rounded-md bg-foreground/10 opacity-0 outline-none hover:bg-highlight hover:text-highlight-foreground focus-visible:opacity-100 group-hover/day:opacity-100 data-[state=open]:opacity-100 [&_svg]:size-3.5"
							>
								<Plus />
							</button>
						</ExamPicker>
					</div>
					{examDay && (
						<span
							className={cn(
								"mt-1 flex shrink-0 items-center gap-1 truncate rounded-md bg-highlight px-1.5 py-0.5 font-semibold text-highlight-foreground [&_svg]:size-3 [&_svg]:shrink-0",
								size
							)}
						>
							<Flag />
							<span className="truncate">{exam.certification.toUpperCase()} exam</span>
						</span>
					)}
					{shownAttempts.map(h => (
						<span
							key={h.attempt_id}
							className={cn(
								"mt-1 shrink-0 truncate rounded-md px-1.5 py-0.5",
								size,
								scoreOf(h) >= h.pass_score
									? "bg-success/15 text-success"
									: "bg-foreground/[0.07] text-muted-foreground"
							)}
						>
							{Math.round(scoreOf(h))}% {shortTitle(h.title)}
						</span>
					))}
					{shownPlans.map(p => (
						<Plan
							key={p.id}
							plan={p}
							missed={p.day < today}
							size={size}
							onDragStart={() => onDrag({ plan: p, over: null })}
							onDragEnd={() => onDrag({ plan: null, over: null })}
							{...actions}
						/>
					))}
					{total > room && (
						<span className="mt-1 shrink-0 px-1.5 text-2xs text-muted-foreground">
							+{total - room} more
						</span>
					)}
				</div>
			</HoverCardTrigger>
			<HoverCardContent>
				<DescribeCard
					lines={lines()}
					className="w-[360px] select-text shadow-[var(--shadow-float)]"
				/>
			</HoverCardContent>
		</HoverCard>
	);
}

/** An open plan on its day: its grip to drag it to another day, its tag to
 * take it the other way (exam or practice), × to remove it */
function Plan({
	plan: p,
	missed,
	size,
	onDragStart,
	onDragEnd,
	onMode,
	onRemove,
}: {
	plan: PlanView;
	/** Its day went by without it */
	missed: boolean;
	size: string;
	onDragStart: () => void;
	onDragEnd: () => void;
} & Pick<GridActions, "onMode" | "onRemove">) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: its parts are buttons; the row only stops the day's click
		<div
			onClick={e => e.stopPropagation()}
			onKeyDown={e => e.stopPropagation()}
			className={cn(
				"group/plan mt-1 flex min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md py-0.5 pr-1 pl-0.5 ring-1 ring-inset",
				size,
				missed
					? "text-muted-foreground ring-border [&>span:nth-child(2)]:line-through"
					: "bg-highlight/10 text-highlight ring-highlight/40"
			)}
		>
			<span
				draggable
				role="img"
				aria-label={`Drag ${p.title} to another day`}
				onDragStart={(e: DragEvent) => {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", String(p.id));
					onDragStart();
				}}
				onDragEnd={onDragEnd}
				className="cursor-grab rounded opacity-70 hover:bg-highlight/20 hover:opacity-100 [&_svg]:size-3"
			>
				<GripVertical />
			</span>
			<span className="min-w-0 flex-1 truncate">{shortTitle(p.title)}</span>
			<ModeToggle plan={p} onMode={onMode} narrow className="shrink-0" />
			<button
				type="button"
				aria-label={`Remove ${p.title}`}
				onClick={() => onRemove(p)}
				className="shrink-0 rounded opacity-0 outline-none hover:bg-highlight/20 focus-visible:opacity-100 group-hover/plan:opacity-100 [&_svg]:size-3"
			>
				<X />
			</button>
		</div>
	);
}
