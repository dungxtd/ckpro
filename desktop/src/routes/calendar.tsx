import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { dayMarkerVariants } from "@ckpro/ui/components/day-marker";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Loading } from "@ckpro/ui/components/loading";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { Stat, StatGroup } from "@ckpro/ui/components/stat";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { DayView } from "@/components/calendar/day-view";
import { ExamTargets } from "@/components/calendar/exam-targets";
import { Screen } from "@/components/shell/screen";
import { bestByDay, minutesByDay, scoreOf, startedAt } from "@/components/study/data";
import { PracticeMap } from "@/components/study/practice-map";
import { addDays, dayKey, monday, parseDay, streak } from "@/days";
import { useExam } from "@/stores/exam";
import { useFocus, useShownTargets, useTargets } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { errorText, examApi, type Mode, type PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { plural } from "@/words";

const short = (d: Date) =>
	d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * When the candidate studies and plans to: the preparation as a map by best
 * score (a lane per exam), the week of the day picked with its figures, and
 * that day: its plans (added, taken the other way, removed, each undoable)
 * and attempts. The day is in the URL
 */
export function CalendarRoute() {
	const [params, setParams] = useSearchParams();
	const targets = useShownTargets();
	const aimed = useTargets();
	const [focus, setFocus] = useFocus();
	const history = useStudy(s => s.history);
	const version = useStudy(s => s.version);
	const [plans, setPlans] = useState<PlanView[]>([]);

	const now = new Date();
	const today = dayKey(now);
	const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") ?? "")
		? (params.get("day") as string)
		: today;
	const date = parseDay(anchor);
	const weekStart = monday(date);
	// From the preparation's start to the last exam (and the week picked)
	const prepStart = targets.length
		? targets.map(t => t.started).sort()[0]
		: dayKey(addDays(now, -70));
	const lastExam = targets
		.map(t => t.date)
		.sort()
		.at(-1);
	const from = [prepStart, dayKey(weekStart)].sort()[0];
	const to = [dayKey(addDays(weekStart, 6)), lastExam ?? today].sort().at(-1) as string;
	const go = (day: string) => setParams({ day });

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
				`Removed ${shortTitle(p.title)}, ${short(parseDay(p.day))}`,
				() => examApi.planAdd(p.day, p.exam_id, p.mode)
			),
	};

	if (history === null) return <Loading fill label="Loading your attempts…" />;

	// The week's figures
	const span = Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)));
	const inSpan = new Set(span);
	const attempts = history.filter(h => inSpan.has(dayKey(new Date(startedAt(h)))));
	const planned = plans.filter(p => inSpan.has(p.day) && p.done === null);
	const average = attempts.length
		? Math.round(attempts.reduce((s, h) => s + scoreOf(h), 0) / attempts.length)
		: null;
	const studied = new Set(attempts.map(h => dayKey(new Date(startedAt(h))))).size;
	const run = streak(new Set(history.map(h => dayKey(new Date(startedAt(h))))), now);
	const plannedDays = new Map<string, string[]>();
	for (const p of plans.filter(p => p.done === null && p.day > today))
		plannedDays.set(p.day, [...(plannedDays.get(p.day) ?? []), p.certification]);

	return (
		<Screen
			title="Calendar"
			width="wide"
			className="@container gap-4"
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
			<Card variant="tinted" padding="md" className="rounded-2xl">
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
					onPick={go}
				/>
			</Card>
			<div className="flex items-center gap-2">
				<IconButton
					variant="toolbar"
					size="sm"
					aria-label="Week before"
					onClick={() => go(dayKey(addDays(date, -7)))}
				>
					<ChevronLeft />
				</IconButton>
				<Button size="push" variant="push" onClick={() => go(today)}>
					Today
				</Button>
				<IconButton
					variant="toolbar"
					size="sm"
					aria-label="Week after"
					onClick={() => go(dayKey(addDays(date, 7)))}
				>
					<ChevronRight />
				</IconButton>
				<h2 className="ml-2 flex-1 truncate font-semibold text-lead">
					Week of {weekStart.toLocaleDateString(undefined, { day: "numeric", month: "long" })}
				</h2>
				{aimed.length > 1 && (
					<SegmentedControl
						label="Exams shown"
						value={focus ?? "all"}
						onChange={v => setFocus(v === "all" ? null : v)}
						options={[
							{ value: "all", label: "All exams" },
							...aimed.map(t => ({ value: t.certification, label: t.certification.toUpperCase() })),
						]}
					/>
				)}
			</div>
			{/* The week of the day picked; the day opens below */}
			<div className="grid grid-cols-7 gap-1.5">
				{span.map(k => {
					const d = parseDay(k);
					const dots = plans.filter(p => p.day === k).length;
					return (
						<button
							key={k}
							type="button"
							aria-pressed={k === anchor}
							aria-label={d.toLocaleDateString(undefined, { dateStyle: "full" })}
							onClick={() => go(k)}
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
			<StatGroup>
				<Stat value={`${studied} of 7`} label="days studied" />
				<Stat
					value={`${attempts.length} of ${attempts.length + planned.length}`}
					label="taken, of all planned"
				/>
				<Stat value={average === null ? "–" : `${average}%`} label="average score" />
				<Stat value={planned.length} label="still planned" />
			</StatGroup>
			<DayView
				day={anchor}
				history={history}
				plans={plans}
				today={today}
				exams={targets}
				onAdd={actions.onAdd}
				onMode={actions.onMode}
				onRemove={actions.onRemove}
			/>
		</Screen>
	);
}
