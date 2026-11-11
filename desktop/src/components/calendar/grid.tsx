import { Badge, badgeVariants } from "@ckpro/ui/components/badge";
import { Card } from "@ckpro/ui/components/card";
import { dayMarkerVariants } from "@ckpro/ui/components/day-marker";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@ckpro/ui/components/hover-card";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { useElementSize } from "@ckpro/ui/hooks/use-element-size";
import { cn } from "@ckpro/ui/lib/utils";
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

interface GridActions {
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
		<Card
			ref={frame}
			padding="none"
			// The month folds into the Day view's small month, and back (routes/calendar)
			data-morph={week ? undefined : "calendar-month"}
			className="relative flex flex-1 flex-col overflow-hidden"
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
							"grid transition-[grid-template-rows,flex-grow,opacity] duration-250 ease-out motion-reduce:transition-none",
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
		</Card>
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
	// (the grown week lists them all, the description too). Plans come first:
	// they are still to do, and their tag and remove are on them
	const total = (examDay ? 1 : 0) + attempts.length + plans.length;
	const room = grown || total <= fits.all ? total : fits.withMore;
	const shownPlans = plans.slice(0, Math.max(0, room - (examDay ? 1 : 0)));
	const shownAttempts = attempts.slice(
		0,
		Math.max(0, room - (examDay ? 1 : 0) - shownPlans.length)
	);
	const size = grown ? "text-callout" : "text-2xs";
	// The day's exam picker is open: the description would cover it
	const [picking, setPicking] = useState(false);

	return (
		// Closed while a plan is dragged (the grid is the drop target then) or
		// while the day's picker is open
		<HoverCard open={drag.plan || picking ? false : undefined}>
			<HoverCardTrigger
				asChild
				// Opened by the day itself taking focus (the keyboard), not by a
				// button in it clicked (+, a plan's tag or grip): that would keep
				// it open until the focus moves on
				onFocus={e => e.target !== e.currentTarget && e.preventDefault()}
			>
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
						// What it holds spaced by the cell's gap, not each its own margin
						"group/day flex min-w-0 cursor-pointer flex-col gap-1 border-border p-1.5 outline-none transition-colors duration-100 not-first:border-l hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
						!grown && "overflow-hidden",
						!grown && day.getMonth() !== month.getMonth() && "text-muted-foreground/60",
						examDay && "bg-highlight/[0.07]",
						drag.over === k && "bg-highlight/15 ring-2 ring-highlight ring-inset"
					)}
				>
					<div className="flex items-center justify-between">
						{/* Today and the exam's day marked as every calendar marks them */}
						<span className={dayMarkerVariants({ today: k === today, exam: examDay, size: "sm" })}>
							{grown && (
								<span className={k === today || examDay ? "" : "text-muted-foreground"}>
									{WEEKDAYS[(day.getDay() + 6) % 7]}
								</span>
							)}
							{day.getDate()}
						</span>
						<ExamPicker
							label={`Plan an exam, ${k}`}
							onPick={id => actions.onAdd(k, id)}
							onOpenChange={setPicking}
						>
							<IconButton
								variant="toolbar"
								size="xs"
								aria-label={`Plan an exam on ${k}`}
								onClick={e => e.stopPropagation()}
								className="opacity-0 focus-visible:opacity-100 group-hover/day:opacity-100 data-[state=open]:opacity-100"
							>
								<Plus />
							</IconButton>
						</ExamPicker>
					</div>
					{examDay && (
						<Badge
							variant="exam"
							className={cn("max-w-full justify-start font-semibold [&_svg]:size-3", size)}
						>
							<Flag />
							<span className="truncate">{exam.certification.toUpperCase()} exam</span>
						</Badge>
					)}
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
					{shownAttempts.map(h => (
						<span
							key={h.attempt_id}
							className={cn(
								"shrink-0 truncate rounded-md px-1.5 py-0.5",
								size,
								scoreOf(h) >= h.pass_score
									? "bg-success/15 text-success"
									: "bg-fill-quiet text-muted-foreground"
							)}
						>
							{Math.round(scoreOf(h))}% {shortTitle(h.title)}
						</span>
					))}
					{total > room && (
						<span className="shrink-0 px-1.5 text-2xs text-muted-foreground tabular-nums">
							+{total - room} more
						</span>
					)}
				</div>
			</HoverCardTrigger>
			{/* Lifted off the grid as every floating layer is */}
			<HoverCardContent className="glass rounded-xl">
				<DescribeCard lines={lines()} className="w-[360px] select-text" />
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
			// Planned, as every plan is marked; one whose day went by, greyed
			className={cn(
				badgeVariants({ variant: "planned" }),
				"group/plan flex min-w-0 shrink-0 justify-start gap-1 overflow-hidden py-0.5 pr-1 pl-0.5 font-normal leading-normal",
				size,
				missed && "text-muted-foreground ring-border [&>span:nth-child(2)]:line-through"
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
			<IconButton
				variant="toolbar"
				size="auto"
				aria-label={`Remove ${p.title}`}
				onClick={() => onRemove(p)}
				className="size-4 rounded-sm text-current opacity-0 focus-visible:opacity-100 group-hover/plan:opacity-100 [&_svg]:size-3"
			>
				<X />
			</IconButton>
		</div>
	);
}
