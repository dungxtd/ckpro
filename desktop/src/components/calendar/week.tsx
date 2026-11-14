import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { dayMarkerVariants } from "@ckpro/ui/components/day-marker";
import { FadeScroll } from "@ckpro/ui/components/fade-scroll";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { SectionTitle } from "@ckpro/ui/components/section-title";
import { Stat } from "@ckpro/ui/components/stat";
import { Swatch } from "@ckpro/ui/components/swatch";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronLeft, ChevronRight, Flag, Plus } from "lucide-react";
import { attemptDay, PASS_DEFAULT, scoreOf, scoreText, scoreTone } from "@/components/study/data";
import { PlanPicker } from "@/components/study/plan-picker";
import { PlanRow } from "@/components/study/plan-row";
import { addDays, dayKey, parseDay, relativeDay, weekName, weekRange } from "@/days";
import type { ExamTarget, HistoryEntry, PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { certName, NONE } from "@/words";

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
	const attempts = history.filter(h => inWeek(attemptDay(h)));
	const open = plans.filter(p => p.done === null && inWeek(p.day));
	const practised = new Set(attempts.map(attemptDay)).size;
	const average = attempts.length
		? Math.round(attempts.reduce((sum, h) => sum + scoreOf(h), 0) / attempts.length)
		: null;
	const pass = attempts[0]?.pass_score ?? PASS_DEFAULT;
	const ahead = open.filter(p => p.day >= today).length;
	const go = (weeks: number) => onPick(dayKey(addDays(parseDay(picked), weeks * 7)));

	return (
		<section aria-label="The week" className="flex grow flex-col gap-3">
			<div className="flex h-10 items-center gap-2">
				<div className="min-w-0">
					<SectionTitle size="lead">{weekName(week, today)}</SectionTitle>
					<div className="text-caption text-muted-foreground">{weekRange(week)}</div>
				</div>
				<div className="ml-4 flex gap-6 border-border border-l pl-5">
					<Stat
						size="inline"
						label="days practised"
						value={
							<>
								{practised}
								<span className="font-medium text-caption text-muted-foreground"> / 7</span>
							</>
						}
					/>
					<Stat
						size="inline"
						label="average score"
						valueClassName={average === null ? "text-muted-foreground" : scoreText(average, pass)}
						value={average === null ? NONE : `${average}%`}
					/>
					<Stat
						size="inline"
						label="planned"
						valueClassName={ahead ? undefined : "text-muted-foreground"}
						value={ahead || NONE}
					/>
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
				className="grid h-0 max-h-120 min-h-52 grow grid-cols-7 grid-rows-[minmax(0,1fr)] divide-x divide-border overflow-hidden rounded-2xl"
			>
				{days.map(day => (
					<Day
						key={day}
						day={day}
						today={today}
						picked={day === picked}
						exams={exams.filter(t => t.date === day)}
						attempts={attempts.filter(h => attemptDay(h) === day)}
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
	const d = parseDay(day);
	const ahead = day >= today;
	const empty = !exams.length && !attempts.length && !plans.length;
	const cert = (c: string | null | undefined) => (several && c ? `${certName(c)} · ` : "");
	return (
		<div
			data-week-day={day}
			className={cn("flex min-h-0 min-w-0 flex-col gap-1 p-2", picked && "bg-highlight/7")}
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
						dayMarkerVariants({ exam: exams.length > 0, picked: day === today }),
						"text-callout",
						day !== today && !exams.length && "font-semibold text-foreground"
					)}
				>
					{d.getDate()}
				</span>
			</button>
			<div className="h-4 px-1 text-2xs text-muted-foreground">
				{day !== today && relativeDay(day, today)}
			</div>
			<FadeScroll axis="y" className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 px-1">
				{exams.map(t => (
					<div
						key={t.certification}
						className="flex items-center gap-1.5 rounded-md bg-highlight/12 px-1.5 py-1 font-semibold text-caption text-highlight [&_svg]:size-3.5"
					>
						<Flag /> {certName(t.certification)} exam
					</div>
				))}
				{attempts.map(h => {
					const score = scoreOf(h);
					return (
						<div key={h.attempt_id} className="flex gap-1.5 rounded-md px-1 py-1">
							<Swatch tone={scoreTone(score, h.pass_score)} className="mt-1" />
							<span className="min-w-0 text-caption leading-snug">
								<span className="line-clamp-2 hyphens-auto break-words">{shortTitle(h.title)}</span>
								<span className="block truncate text-2xs text-muted-foreground">
									{/* The score first: a narrow column cuts the rest */}
									<span
										className={cn("font-semibold tabular-nums", scoreText(score, h.pass_score))}
									>
										{Math.round(score)}%
									</span>{" "}
									· {cert(h.certification)}
									{h.mode === "exam" ? "exam" : "practice"}
								</span>
							</span>
						</div>
					);
				})}
				{plans.map(p => (
					<PlanRow
						key={p.id}
						plan={p}
						compact
						// Today's or later: pressed, it starts once confirmed
						startable={ahead}
						late={!ahead}
						several={several}
						onRemove={onRemove}
					/>
				))}
				{empty && (
					<div className="px-1 py-1 text-caption text-muted-foreground">
						{ahead ? "Free" : "No practice"}
					</div>
				)}
			</FadeScroll>
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
