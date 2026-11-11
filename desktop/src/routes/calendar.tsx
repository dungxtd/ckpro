import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { dayMarkerVariants } from "@ckpro/ui/components/day-marker";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Loading } from "@ckpro/ui/components/loading";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { Stat, StatGroup } from "@ckpro/ui/components/stat";
import { morph } from "@ckpro/ui/lib/morph";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { DayView } from "@/components/calendar/day-view";
import { ExamTargets } from "@/components/calendar/exam-targets";
import { Grid } from "@/components/calendar/grid";
import { Screen } from "@/components/shell/screen";
import { bestByDay, minutesByDay, scoreOf, startedAt } from "@/components/study/data";
import { PracticeMap } from "@/components/study/practice-map";
import { addDays, dayKey, monday, monthWeeks, parseDay, streak } from "@/days";
import { useExam } from "@/stores/exam";
import { useShownTargets } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { errorText, examApi, type Mode, type PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { plural } from "@/words";

type View = "map" | "month" | "week" | "day";
const VIEWS = [
	{ value: "map", label: "Map" },
	{ value: "month", label: "Month" },
	{ value: "week", label: "Week" },
	{ value: "day", label: "Day" },
];
const short = (d: Date) =>
	d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * When the candidate studies and plans to: Month, Week (this week of the
 * month, grown) or Day. Plans are added with +, moved by their grip, taken
 * the other way from their tag and removed, each undoable; the figures
 * follow the view. The view and the day are in the URL
 */
export function CalendarRoute() {
	const [params, setParams] = useSearchParams();
	const targets = useShownTargets();
	const history = useStudy(s => s.history);
	const version = useStudy(s => s.version);
	const [plans, setPlans] = useState<PlanView[]>([]);

	const now = new Date();
	const today = dayKey(now);
	const view = (
		["map", "month", "week", "day"].includes(params.get("view") ?? "") ? params.get("view") : "map"
	) as View;
	const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") ?? "")
		? (params.get("day") as string)
		: today;
	const date = parseDay(anchor);
	const month = new Date(date.getFullYear(), date.getMonth(), 1);
	const weeks = monthWeeks(month);
	// The map runs from the preparation's start to the last exam; the others, the month
	const prepStart = targets.length
		? targets.map(t => t.started).sort()[0]
		: dayKey(addDays(now, -70));
	const lastExam = targets
		.map(t => t.date)
		.sort()
		.at(-1);
	const from = view === "map" ? [prepStart, dayKey(monday(date))].sort()[0] : dayKey(weeks[0][0]);
	const to =
		view === "map"
			? ([dayKey(addDays(monday(date), 6)), lastExam ?? today].sort().at(-1) as string)
			: dayKey(weeks.at(-1)?.[6] ?? date);
	const go = (next: { view?: View; day?: string }) => {
		const to = { view: next.view ?? view, day: next.day ?? anchor };
		const change = () => setParams(to);
		// Into the Day view and out of it the calendar moves as one: the month
		// folds into the small month, the day's cell (a week's column too)
		// opens into the day, and back
		if (view === to.view || (view !== "day" && to.view !== "day")) return change();
		morph(change, {
			month: () => document.querySelector('[data-morph="calendar-month"]'),
			day: () =>
				document.querySelector(`[data-day="${to.day}"]`) ??
				document.querySelector('[data-morph="calendar-day"]'),
		});
	};

	const reload = useCallback(
		() => examApi.plans(from, to).then(setPlans, () => setPlans([])),
		[from, to]
	);
	// Again as the study changes (a plan, an exam deleted with its plans)
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version is the cue
	useEffect(() => {
		reload();
	}, [reload, version]);

	/** Do a change, read the plans again, and offer to undo it */
	const change = async (
		run: () => Promise<unknown>,
		message: string,
		undo: () => Promise<unknown>
	) => {
		try {
			await run();
			await reload();
			toast(message, {
				action: {
					label: "Undo",
					onClick: () => undo().then(reload, e => toast.error(errorText(e))),
				},
			});
		} catch (e) {
			toast.error(errorText(e));
		}
	};
	const actions = {
		onOpen: (day: string) => go({ view: "day", day }),
		onAdd: (day: string, examId: string) => {
			let id = 0;
			const title = useExam.getState().catalog.find(e => e.id === examId)?.title ?? examId;
			return change(
				async () => {
					id = await examApi.planAdd(day, examId, "practice");
				},
				`Planned ${shortTitle(title)}, ${short(parseDay(day))}`,
				() => examApi.planRemove(id)
			);
		},
		onMove: (p: PlanView, day: string) =>
			change(
				() => examApi.planUpdate(p.id, { day }),
				`Moved ${shortTitle(p.title)} to ${short(parseDay(day))}`,
				() => examApi.planUpdate(p.id, { day: p.day })
			),
		onMode: (p: PlanView) => {
			const mode: Mode = p.mode === "exam" ? "practice" : "exam";
			return change(
				() => examApi.planUpdate(p.id, { mode }),
				`${shortTitle(p.title)}: as ${mode === "exam" ? "an exam" : "practice"}`,
				() => examApi.planUpdate(p.id, { mode: p.mode })
			);
		},
		onRemove: (p: PlanView) =>
			change(
				() => examApi.planRemove(p.id),
				`Removed ${shortTitle(p.title)}`,
				() => examApi.planAdd(p.day, p.exam_id, p.mode)
			),
	};

	if (history === null) return <Loading fill label="Loading your attempts…" />;

	// The days the figures count: the month, the week, or the day
	const weekStart = monday(date);
	const span =
		view === "day"
			? [anchor]
			: view === "week" || view === "map"
				? Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)))
				: Array.from(
						{ length: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() },
						(_, i) => dayKey(addDays(month, i))
					);
	const inSpan = new Set(span);
	const plannedDays = new Map<string, string[]>();
	for (const p of plans.filter(p => p.done === null && p.day > today))
		plannedDays.set(p.day, [...(plannedDays.get(p.day) ?? []), p.certification]);
	const attempts = history.filter(h => inSpan.has(dayKey(new Date(startedAt(h)))));
	const planned = plans.filter(p => inSpan.has(p.day) && p.done === null);
	const average = attempts.length
		? Math.round(attempts.reduce((s, h) => s + scoreOf(h), 0) / attempts.length)
		: null;
	const studied = new Set(attempts.map(h => dayKey(new Date(startedAt(h))))).size;
	const run = streak(new Set(history.map(h => dayKey(new Date(startedAt(h))))), now);
	const shift = (by: number) =>
		go({
			day: dayKey(
				view === "day"
					? addDays(date, by)
					: view === "week" || view === "map"
						? addDays(date, 7 * by)
						: new Date(date.getFullYear(), date.getMonth() + by, 1)
			),
		});
	const title =
		view === "day"
			? date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
			: view === "week" || view === "map"
				? `Week of ${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`
				: date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

	return (
		<Screen
			title="Calendar"
			// The month and the week fill the window's height (the day lists)
			width="wide"
			className={cn("@container gap-4", view !== "day" && "min-h-full")}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					{/* The exams aimed at: each one's day and the days left; changed or added here */}
					<ExamTargets />
					{run > 0 && (
						<span className="mr-1 whitespace-nowrap text-caption text-muted-foreground tabular-nums">
							{plural(run, "day")} in a row
						</span>
					)}
				</div>
			}
		>
			{/* The toolbar on a line of its own, so a longer title moves nothing: where
			    the calendar is on the left, the view on the right */}
			<div className="-mt-2 flex items-center gap-2">
				<IconButton variant="toolbar" size="sm" aria-label="Back" onClick={() => shift(-1)}>
					<ChevronLeft />
				</IconButton>
				<Button size="push" variant="push" onClick={() => go({ day: today })}>
					Today
				</Button>
				<IconButton variant="toolbar" size="sm" aria-label="Forward" onClick={() => shift(1)}>
					<ChevronRight />
				</IconButton>
				<h2 className="ml-2 flex-1 truncate font-semibold text-lead">{title}</h2>
				<SegmentedControl
					label="View"
					value={view}
					onChange={v => go({ view: v as View })}
					options={VIEWS}
				/>
			</div>
			<StatGroup>
				{view === "day" ? (
					<>
						<Stat value={attempts.length} label="done" />
						<Stat value={planned.length} label="planned" />
						<Stat value={average === null ? "–" : `${average}%`} label="average score" />
						<Stat value={attempts.filter(h => scoreOf(h) >= h.pass_score).length} label="passed" />
					</>
				) : (
					<>
						<Stat value={`${studied} of ${span.length}`} label="days studied" />
						<Stat
							value={`${attempts.length} of ${attempts.length + planned.length}`}
							label="taken, of all planned"
						/>
						<Stat value={average === null ? "–" : `${average}%`} label="average score" />
						<Stat value={planned.length} label="still planned" />
					</>
				)}
			</StatGroup>
			{view === "map" ? (
				<>
					<Card padding="md" className="rounded-2xl">
						<PracticeMap
							mode="score"
							start={parseDay(prepStart)}
							exams={targets}
							minutes={minutesByDay(history)}
							best={bestByDay(history)}
							pass={66}
							planned={plannedDays}
							lanes
							cell={15}
							picked={anchor}
							onPick={day => go({ day })}
						/>
					</Card>
					{/* The week of the day picked; a day opens below */}
					<div className="grid grid-cols-7 gap-1.5">
						{Array.from({ length: 7 }, (_, i) => {
							const d = addDays(weekStart, i);
							const k = dayKey(d);
							const dots = plans.filter(p => p.day === k).length;
							return (
								<button
									key={k}
									type="button"
									aria-pressed={k === anchor}
									aria-label={d.toLocaleDateString(undefined, { dateStyle: "full" })}
									onClick={() => go({ day: k })}
									className={cn(
										"flex flex-col items-center gap-1 rounded-xl py-2 hover:bg-hover",
										k === anchor && "bg-fill-quiet"
									)}
								>
									<span className="text-caption text-muted-foreground">
										{d.toLocaleDateString(undefined, { weekday: "short" })}
									</span>
									<span
										className={dayMarkerVariants({
											today: k === today,
											exam: targets.some(t => t.date === k),
											picked: k === anchor,
										})}
									>
										{d.getDate()}
									</span>
									<span className="flex h-1.5 gap-0.5">
										{Array.from({ length: Math.min(dots, 3) }, (_, j) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: a count of dots
											<i key={j} className="size-1.5 rounded-full bg-highlight" />
										))}
									</span>
								</button>
							);
						})}
					</div>
					<DayView
						day={anchor}
						history={history}
						plans={plans}
						today={today}
						exams={targets}
						month={false}
						onPick={day => go({ day })}
						onShift={by => go({ day: dayKey(addDays(date, 7 * by)) })}
						onAdd={actions.onAdd}
						onMode={actions.onMode}
						onRemove={actions.onRemove}
					/>
				</>
			) : view === "day" ? (
				<DayView
					day={anchor}
					history={history}
					plans={plans}
					today={today}
					exams={targets}
					onPick={day => go({ day })}
					onShift={by => go({ day: dayKey(new Date(date.getFullYear(), date.getMonth() + by, 1)) })}
					onAdd={actions.onAdd}
					onMode={actions.onMode}
					onRemove={actions.onRemove}
				/>
			) : (
				<Grid
					month={month}
					week={view === "week" ? weekStart : null}
					history={history}
					plans={plans}
					today={today}
					exams={targets}
					{...actions}
				/>
			)}
		</Screen>
	);
}
