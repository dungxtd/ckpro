import { Button } from "@ckdry/ui/components/button";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Loading } from "@ckdry/ui/components/loading";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import { Stat, StatGroup } from "@ckdry/ui/components/stat";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { DayView } from "@/components/calendar/day-view";
import { Grid } from "@/components/calendar/grid";
import { Screen } from "@/components/shell/screen";
import { scoreOf, startedAt, weakest, weekRecap } from "@/components/study/data";
import { Recap } from "@/components/study/recap";
import { addDays, dayKey, monday, monthWeeks, parseDay, streak } from "@/days";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import {
	type ExamReadiness,
	errorText,
	examApi,
	type HistoryEntry,
	type Mode,
	type PlanView,
} from "@/tauri/api";
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
	const [readiness, setReadiness] = useState<ExamReadiness | null>(null);

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
	const go = (next: { view?: View; day?: string }) =>
		setParams({ view: next.view ?? view, day: next.day ?? anchor });

	const reload = useCallback(() => examApi.plans(from, to).then(setPlans), [from, to]);
	useEffect(() => {
		if (!idle) return;
		examApi.history().then(setHistory);
		reload();
	}, [idle, reload]);
	useEffect(() => {
		if (target && idle)
			examApi.readiness(target.certification).then(setReadiness, () => setReadiness(null));
	}, [target, idle]);

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
	const weak = weakest(readiness);
	const next = weak && { domain: weak.domain, percent: (weak.points * 100) / weak.max_points };
	const lastMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);

	return (
		<Screen
			title="Calendar"
			className="max-w-6xl gap-4"
			actions={
				<div className="flex items-center gap-2">
					{run > 0 && (
						<span className="mr-1 text-caption text-muted-foreground">
							{run} day{run === 1 ? "" : "s"} in a row
						</span>
					)}
					<SegmentedControl
						label="View"
						value={view}
						onChange={v => go({ view: v as View })}
						options={VIEWS}
					/>
					<span className="ml-2 min-w-40 text-right font-semibold text-lead">{title}</span>
					<IconButton variant="toolbar" size="sm" aria-label="Back" onClick={() => shift(-1)}>
						<ChevronLeft />
					</IconButton>
					<Button size="push" variant="push" onClick={() => go({ day: today })}>
						Today
					</Button>
					<IconButton variant="toolbar" size="sm" aria-label="Forward" onClick={() => shift(1)}>
						<ChevronRight />
					</IconButton>
				</div>
			}
		>
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
			{view === "week" && (
				<Recap
					title={`Your week, ${short(weekStart)} to ${short(addDays(weekStart, 6))}`}
					recap={weekRecap(history, weekStart)}
					next={next}
					action={{
						label: "Plan next week",
						to: `/calendar?view=week&day=${dayKey(addDays(weekStart, 7))}`,
					}}
				/>
			)}
			{view === "month" && (
				<Recap
					title={`Last month, ${lastMonth.toLocaleDateString(undefined, { month: "long" })}`}
					recap={weekRecap(
						history,
						lastMonth,
						new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate()
					)}
					next={next}
					action={{
						label: "Plan next month",
						to: `/calendar?view=month&day=${dayKey(new Date(date.getFullYear(), date.getMonth() + 1, 1))}`,
					}}
				/>
			)}
			{view === "day" ? (
				<DayView
					day={anchor}
					history={history}
					plans={plans}
					today={today}
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
					{...actions}
				/>
			)}
		</Screen>
	);
}
