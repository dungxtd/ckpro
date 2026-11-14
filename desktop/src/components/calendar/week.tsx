import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { dayMarkerVariants } from "@ckpro/ui/components/day-marker";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { RowCover } from "@ckpro/ui/components/row-cover";
import { useScrollEdges } from "@ckpro/ui/hooks/use-scroll-edges";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronLeft, ChevronRight, Flag, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { scoreOf, startedAt } from "@/components/study/data";
import { PlanPicker } from "@/components/study/plan-picker";
import { addDays, dayKey, monday, parseDay } from "@/days";
import { useExam, useExamBusy } from "@/stores/exam";
import type { ExamTarget, HistoryEntry, PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";

const when = (day: string, today: string) => {
	const n = Math.round((parseDay(day).getTime() - parseDay(today).getTime()) / 86_400_000);
	return n === 0
		? null
		: n === 1
			? "tomorrow"
			: n === -1
				? "yesterday"
				: n < 0
					? `${-n} days ago`
					: `in ${n} days`;
};

/** The week's name: this, next or last week, else the week of its Monday */
const weekName = (week: Date, today: string) => {
	const weeks = Math.round((week.getTime() - monday(parseDay(today)).getTime()) / (7 * 86_400_000));
	return weeks === 0
		? "This week"
		: weeks === 1
			? "Next week"
			: weeks === -1
				? "Last week"
				: `Week of ${week.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`;
};

const range = (week: Date) => {
	const end = addDays(week, 6);
	return week.getMonth() === end.getMonth()
		? `${week.getDate()} – ${end.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`
		: `${week.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
};

/**
 * One week, a column a day as a week calendar lays it out: each day's exam
 * day, attempts (the score, tinted as on the map) and plans (pressed, one
 * starts once confirmed; removed under the pointer), and from today on a
 * way to plan it. The columns keep one height whatever they hold (a full
 * day scrolls), so picking or planning moves nothing: the rest of the
 * window, between a floor and a ceiling. Above them the week's
 * name and figures, and the way to the weeks around, at the right
 */
export function Week({
	week,
	history,
	plans,
	today,
	exams,
	picked,
	several,
	onPick,
	onRemove,
}: {
	/** The week's Monday */
	week: Date;
	/** The attempts shown (of the exams in focus) */
	history: HistoryEntry[];
	plans: PlanView[];
	today: string;
	exams: ExamTarget[];
	picked: string;
	/** Several exams shown: each line says which */
	several: boolean;
	onPick: (day: string) => void;
	onRemove: (plan: PlanView) => void;
}) {
	const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(week, i)));
	const inWeek = (day: string) => day >= days[0] && day <= days[6];
	const attempts = history.filter(h => inWeek(dayKey(new Date(startedAt(h)))));
	const open = plans.filter(p => p.done === null && inWeek(p.day));
	const practised = new Set(attempts.map(h => dayKey(new Date(startedAt(h))))).size;
	const average = attempts.length
		? Math.round(attempts.reduce((sum, h) => sum + scoreOf(h), 0) / attempts.length)
		: null;
	const passing = attempts.length
		? attempts.filter(h => scoreOf(h) >= h.pass_score).length * 2 >= attempts.length
		: false;
	const ahead = open.filter(p => p.day >= today).length;
	const go = (weeks: number) => onPick(dayKey(addDays(parseDay(picked), weeks * 7)));

	return (
		<section aria-label="The week" className="flex grow flex-col gap-3">
			<div className="flex h-10 items-center gap-2">
				<div className="min-w-0">
					<h2 className="truncate font-semibold text-lead leading-tight">
						{weekName(week, today)}
					</h2>
					<div className="text-caption text-muted-foreground">{range(week)}</div>
				</div>
				<div className="ml-4 flex gap-6 border-border border-l pl-5">
					<Figure label="days practised">
						{practised}
						<span className="font-medium text-caption text-muted-foreground"> / 7</span>
					</Figure>
					<Figure
						label="average score"
						className={
							average === null ? "text-muted-foreground" : passing ? "text-success" : "text-warning"
						}
					>
						{average === null ? "–" : `${average}%`}
					</Figure>
					<Figure label="planned" className={ahead ? undefined : "text-muted-foreground"}>
						{ahead || "–"}
					</Figure>
				</div>
				<span className="flex-1" />
				<IconButton variant="toolbar" size="sm" aria-label="Week before" onClick={() => go(-1)}>
					<ChevronLeft />
				</IconButton>
				<Button
					size="push"
					variant="push"
					disabled={picked === today}
					onClick={() => onPick(today)}
				>
					Today
				</Button>
				<IconButton variant="toolbar" size="sm" aria-label="Week after" onClick={() => go(1)}>
					<ChevronRight />
				</IconButton>
			</div>
			<Card
				variant="tinted"
				padding="none"
				// The rest of the window, within bounds: never too short for a plan
				// or two, never so tall a short week looks empty. No height of its
				// own (only the floor), so a short window scrolls the page rather
				// than the screen growing to what the days hold
				className="grid h-0 min-h-52 grow grid-cols-7 grid-rows-[minmax(0,1fr)] divide-x divide-border overflow-hidden rounded-2xl max-h-[30rem]"
			>
				{days.map(day => (
					<Day
						key={day}
						day={day}
						today={today}
						picked={day === picked}
						exams={exams.filter(t => t.date === day)}
						attempts={attempts.filter(h => dayKey(new Date(startedAt(h))) === day)}
						plans={open.filter(p => p.day === day)}
						several={several}
						onPick={onPick}
						onRemove={onRemove}
					/>
				))}
			</Card>
		</section>
	);
}

function Figure({
	label,
	className,
	children,
}: {
	label: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-w-14 flex-col leading-tight">
			<span className={cn("font-semibold text-lead tabular-nums", className)}>{children}</span>
			<span className="whitespace-nowrap text-2xs text-muted-foreground">{label}</span>
		</div>
	);
}

function Day({
	day,
	today,
	picked,
	exams,
	attempts,
	plans,
	several,
	onPick,
	onRemove,
}: {
	day: string;
	today: string;
	picked: boolean;
	exams: ExamTarget[];
	attempts: HistoryEntry[];
	plans: PlanView[];
	several: boolean;
	onPick: (day: string) => void;
	onRemove: (plan: PlanView) => void;
}) {
	const askStart = useExam(s => s.askStart);
	const busy = useExamBusy();
	const [list] = useScrollEdges<HTMLDivElement>("y");
	const d = parseDay(day);
	const ahead = day >= today;
	const empty = !exams.length && !attempts.length && !plans.length;
	const cert = (c: string | null | undefined) => (several && c ? `${c.toUpperCase()} · ` : "");
	return (
		<div
			data-week-day={day}
			className={cn("flex min-h-0 min-w-0 flex-col gap-1 p-2", picked && "bg-highlight/[0.07]")}
		>
			<button
				type="button"
				aria-pressed={picked}
				aria-label={d.toLocaleDateString(undefined, { dateStyle: "full" })}
				onClick={() => onPick(day)}
				className="flex items-center justify-between rounded-md px-1 text-caption text-muted-foreground hover:text-foreground"
			>
				{d.toLocaleDateString(undefined, { weekday: "short" })}
				<span
					className={cn(
						dayMarkerVariants({ size: "sm", exam: exams.length > 0, picked: day === today }),
						"text-callout",
						day !== today && !exams.length && "font-semibold text-foreground"
					)}
				>
					{d.getDate()}
				</span>
			</button>
			<div className="h-4 px-1 text-2xs text-muted-foreground">{when(day, today)}</div>
			<div
				ref={list}
				className="fade-y -mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 [scrollbar-width:none]"
			>
				{exams.map(t => (
					<div
						key={t.certification}
						className="flex items-center gap-1.5 rounded-md bg-highlight/12 px-1.5 py-1 font-semibold text-caption text-highlight [&_svg]:size-3.5"
					>
						<Flag /> {t.certification.toUpperCase()} exam
					</div>
				))}
				{attempts.map(h => {
					const passed = scoreOf(h) >= h.pass_score;
					return (
						<div key={h.attempt_id} className="flex gap-1.5 rounded-md px-1 py-1">
							<span
								aria-hidden
								className={cn(
									"mt-1 size-2.5 shrink-0 rounded-[3px]",
									passed ? "bg-success" : "bg-warning/60"
								)}
							/>
							<span className="min-w-0 text-caption leading-snug">
								<span className="line-clamp-2 hyphens-auto break-words">{shortTitle(h.title)}</span>
								<span className="block truncate text-2xs text-muted-foreground">
									{/* The score first: a narrow column cuts the rest */}
									<span
										className={cn(
											"font-semibold tabular-nums",
											passed ? "text-success" : "text-warning"
										)}
									>
										{Math.round(scoreOf(h))}%
									</span>{" "}
									· {cert(h.certification)}
									{h.mode === "exam" ? "exam" : "practice"}
								</span>
							</span>
						</div>
					);
				})}
				{plans.map(p => (
					<div
						key={p.id}
						className="group/plan relative flex gap-1.5 rounded-md px-1 py-1 hover:bg-hover"
					>
						{/* Today's or later: pressed, it starts once confirmed */}
						{ahead && (
							<RowCover
								aria-label={`${p.mode === "exam" ? "Start exam" : "Start practice"}: ${shortTitle(p.title)}`}
								disabled={busy}
								onClick={() => askStart(p.exam_id, p.mode, p.title)}
							/>
						)}
						<span
							aria-hidden
							className="mt-1 size-2.5 shrink-0 rounded-[3px] ring-[1.5px] ring-muted-foreground/60 ring-inset"
						/>
						<span className="min-w-0 flex-1 text-caption leading-snug">
							<span className="line-clamp-2 hyphens-auto break-words">{shortTitle(p.title)}</span>
							<span className="block truncate text-2xs text-muted-foreground">
								{cert(p.certification)}
								{p.mode === "exam" ? "exam" : "practice"}
								{!ahead && " · not taken"}
							</span>
						</span>
						<IconButton
							variant="toolbar"
							size="sm"
							aria-label={`Remove ${p.title}`}
							onClick={() => onRemove(p)}
							className="absolute top-0.5 right-0.5 size-5 opacity-0 focus-visible:opacity-100 group-hover/plan:opacity-100 [&_svg]:size-3"
						>
							<X />
						</IconButton>
					</div>
				))}
				{empty && (
					<div className="px-1 py-1 text-caption text-muted-foreground">
						{ahead ? "Free" : "No practice"}
					</div>
				)}
			</div>
			{ahead && (
				<PlanPicker
					day={day}
					// Beside the column, which shows what changes
					side={(d.getDay() + 6) % 7 < 4 ? "right" : "left"}
					onOpenChange={o => o && onPick(day)}
				>
					<button
						type="button"
						aria-label={`Plan on ${d.toLocaleDateString(undefined, { dateStyle: "full" })}`}
						className={cn(
							"flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-caption hover:bg-hover hover:text-highlight [&_svg]:size-3.5",
							picked ? "text-highlight" : "text-muted-foreground"
						)}
					>
						<Plus /> Plan
					</button>
				</PlanPicker>
			)}
		</div>
	);
}
