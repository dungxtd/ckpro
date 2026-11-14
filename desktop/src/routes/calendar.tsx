import { Card } from "@ckpro/ui/components/card";
import { Loading } from "@ckpro/ui/components/loading";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { ExamMenu } from "@/components/calendar/exam-menu";
import { Week } from "@/components/calendar/week";
import { Screen } from "@/components/shell/screen";
import { bestByDay, minutesByDay, startedAt } from "@/components/study/data";
import { PracticeMap } from "@/components/study/practice-map";
import { addDays, dayKey, monday, parseDay, streak } from "@/days";
import { useFocus, useShownTargets } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { errorText, examApi, type PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { plural } from "@/words";

const short = (d: Date) =>
	d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * When the candidate studies and plans to, for the exams shown (all, or the
 * one picked beside the title): the preparation as a map by best score (a
 * lane per exam), then the week of the day picked, a column a day with its
 * attempts and plans (added, removed, each undoable; started). The day is in
 * the URL
 */
export function CalendarRoute() {
	const [params, setParams] = useSearchParams();
	const targets = useShownTargets();
	const [focus] = useFocus();
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
	// The map's whole span, and the week picked (it may lie outside it)
	const from = [prepStart, dayKey(weekStart)].sort()[0];
	const to = [dayKey(addDays(weekStart, 6)), lastExam ?? today].sort().at(-1) as string;
	const go = (day: string) => setParams({ day });

	// Only the last read's answer is kept: moving on quickly, an earlier
	// week's answer may come after the later one
	const asked = useRef(0);
	const reload = useCallback(() => {
		const ask = ++asked.current;
		return examApi.plans(from, to).then(
			plans => ask === asked.current && setPlans(plans),
			() => ask === asked.current && setPlans([])
		);
	}, [from, to]);
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
		onRemove: (p: PlanView) =>
			change(
				() => examApi.planRemove(p.id),
				`Removed ${shortTitle(p.title)}, ${short(parseDay(p.day))}`,
				() => examApi.planAdd(p.day, p.exam_id, p.mode)
			),
	};

	if (history === null) return <Loading fill label="Loading your attempts…" />;

	// The attempts of the exams shown
	const shown = focus ? history.filter(h => h.certification === focus) : history;
	const run = streak(new Set(history.map(h => dayKey(new Date(startedAt(h))))), now);
	const plannedDays = new Map<string, string[]>();
	for (const p of plans.filter(p => p.done === null && p.day > today))
		plannedDays.set(p.day, [...(plannedDays.get(p.day) ?? []), p.certification]);

	return (
		<Screen
			title="Calendar"
			width="wide"
			className="@container min-h-full gap-4"
			// The exams aimed at, which the whole screen shows; changed or added there
			accessory={<ExamMenu />}
			actions={
				run > 0 && (
					<span className="whitespace-nowrap text-callout text-muted-foreground tabular-nums">
						{plural(run, "day")} in a row
					</span>
				)
			}
		>
			<Card variant="tinted" padding="md" className="rounded-2xl">
				<PracticeMap
					mode="score"
					start={parseDay(prepStart)}
					exams={targets}
					minutes={minutesByDay(shown)}
					best={bestByDay(shown)}
					pass={66}
					planned={plannedDays}
					lanes
					cell={15}
					picked={anchor}
					onPick={go}
				/>
			</Card>
			<Week
				week={weekStart}
				history={shown}
				plans={plans.filter(p => !focus || p.certification === focus)}
				today={today}
				exams={targets}
				picked={anchor}
				several={targets.length > 1}
				onPick={go}
				onRemove={actions.onRemove}
			/>
		</Screen>
	);
}
