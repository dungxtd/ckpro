import { Button } from "@ckpro/ui/components/button";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Loading } from "@ckpro/ui/components/loading";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { Stat, StatGroup } from "@ckpro/ui/components/stat";
import { morph } from "@ckpro/ui/lib/morph";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { DayView } from "@/components/calendar/day-view";
import { Grid } from "@/components/calendar/grid";
import { Screen } from "@/components/shell/screen";
import { daysUntil, scoreOf, startedAt } from "@/components/study/data";
import { addDays, dayKey, monday, monthWeeks, parseDay, streak } from "@/days";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import { errorText, examApi, type HistoryEntry, type Mode, type PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";

type View = "month" | "week" | "day";
const VIEWS = [
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
	const target = useSettings(s => s.settings.target);
	const idle = useExam(s => !s.state || s.state.phase === "idle");
	const [history, setHistory] = useState<HistoryEntry[] | null>(null);
	const [plans, setPlans] = useState<PlanView[]>([]);

	const now = new Date();
	const today = dayKey(now);
	const view = (
		["month", "week", "day"].includes(params.get("view") ?? "") ? params.get("view") : "month"
	) as View;
	const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") ?? "")
		? (params.get("day") as string)
		: today;
	const date = parseDay(anchor);
	const month = new Date(date.getFullYear(), date.getMonth(), 1);
	const weeks = monthWeeks(month);
	const from = dayKey(weeks[0][0]);
	const to = dayKey(weeks.at(-1)?.[6] ?? date);
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

	const reload = useCallback(() => examApi.plans(from, to).then(setPlans), [from, to]);
	// Again when the exams change: one deleted takes its plans
	const catalog = useExam(s => s.catalog);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the exams changing is the cue
	useEffect(() => {
		if (!idle) return;
		examApi.history().then(setHistory);
		reload();
	}, [idle, reload, catalog]);

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

	if (history === null) return <Loading fill label="Reading your attempts…" />;

	// The days the figures count: the month, the week, or the day
	const weekStart = monday(date);
	const span =
		view === "day"
			? [anchor]
			: view === "week"
				? Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)))
				: Array.from(
						{ length: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() },
						(_, i) => dayKey(addDays(month, i))
					);
	const inSpan = new Set(span);
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
					: view === "week"
						? addDays(date, 7 * by)
						: new Date(date.getFullYear(), date.getMonth() + by, 1)
			),
		});
	const title =
		view === "day"
			? date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
			: view === "week"
				? `Week of ${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`
				: date.toLocaleDateString(undefined, { month: "long", year: "numeric" });

	return (
		<Screen
			title="Calendar"
			// The month and the week fill the window's height (the day lists)
			className={cn("@container max-w-[1440px] gap-4", view !== "day" && "min-h-full")}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					{target && daysUntil(target.date, now) >= 0 && (
						<Button
							size="sm"
							variant="ghost"
							className="text-highlight"
							onClick={() => go({ view: "day", day: target.date })}
						>
							<Flag />
							{daysUntil(target.date, now) === 0
								? `${target.certification.toUpperCase()} exam today`
								: `${target.certification.toUpperCase()} exam in ${daysUntil(target.date, now)} days`}
						</Button>
					)}
					{run > 0 && (
						<span className="mr-1 whitespace-nowrap text-caption text-muted-foreground">
							{run} day{run === 1 ? "" : "s"} in a row
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
						<Stat value={`${studied} / ${span.length}`} label="days studied" />
						<Stat
							value={`${attempts.length} / ${attempts.length + planned.length}`}
							label="done of done and planned"
						/>
						<Stat value={average === null ? "–" : `${average}%`} label="average score" />
						<Stat value={planned.length} label="planned" />
					</>
				)}
			</StatGroup>
			{view === "day" ? (
				<DayView
					day={anchor}
					history={history}
					plans={plans}
					today={today}
					exam={target}
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
					exam={target}
					{...actions}
				/>
			)}
		</Screen>
	);
}
