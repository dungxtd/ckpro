import { Card } from "@ckpro/ui/components/card";
import { Loading } from "@ckpro/ui/components/loading";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Week } from "@/components/calendar/week";
import { Screen } from "@/components/shell/screen";
import {
	attemptDay,
	bestByDay,
	minutesByDay,
	PASS_DEFAULT,
	plannedByDay,
	prepStart,
} from "@/components/study/data";
import { ExamMenu } from "@/components/study/exam-menu";
import { PracticeMap } from "@/components/study/practice-map";
import { addDays, dayKey, monday, parseDay, streak } from "@/days";
import { useShownTargets } from "@/stores/settings";
import { usePlans, useShownStudy, useStudy } from "@/stores/study";
import { errorText, examApi, type PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { toastUndo } from "@/toast";
import { plural, shortDay } from "@/words";

/**
 * When the candidate studies and plans to, for the exams shown (all, or the
 * one picked beside the title): the preparation as a map by best score (a
 * lane per exam), then the week of the day picked, a column a day with its
 * attempts and plans (removed, undoably; started). The day is in the URL.
 * The plans follow the study's changes (a plan added or removed, an exam
 * deleted with its plans)
 */
export function CalendarRoute() {
	const [params, setParams] = useSearchParams();
	const targets = useShownTargets();
	const all = useStudy(s => s.history);
	const { history: shown, ofShown } = useShownStudy();

	const now = new Date();
	const today = dayKey(now);
	const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") ?? "")
		? (params.get("day") as string)
		: today;
	const weekStart = monday(parseDay(anchor));
	// From the preparation's start to the last exam (and the week picked)
	const start = prepStart(targets, shown ?? [], now);
	const lastExam = targets
		.map(t => t.date)
		.sort()
		.at(-1);
	// The map's whole span, and the week picked (it may lie outside it)
	const from = [start, dayKey(weekStart)].sort()[0];
	const to = [dayKey(addDays(weekStart, 6)), lastExam ?? today].sort().at(-1) as string;
	const { plans: read } = usePlans(from, to);
	const plans = ofShown(read ?? []);
	const go = (day: string) => setParams({ day });

	/** Remove a plan, with Undo */
	const remove = (p: PlanView) =>
		examApi.planRemove(p.id).then(
			() =>
				toastUndo(`Removed ${shortTitle(p.title)}, ${shortDay(parseDay(p.day))}`, () =>
					examApi.planAdd(p.day, p.exam_id, p.mode)
				),
			e => toast.error(errorText(e))
		);

	if (all === null || shown === null) return <Loading fill label="Loading your attempts…" />;

	// The days in a row, of every exam's practice
	const run = streak(new Set(all.map(attemptDay)), now);

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
					start={parseDay(start)}
					exams={targets}
					minutes={minutesByDay(shown)}
					best={bestByDay(shown)}
					pass={PASS_DEFAULT}
					planned={plannedByDay(plans, today)}
					lanes
					cell={15}
					picked={anchor}
					onPick={go}
				/>
			</Card>
			<Week
				week={weekStart}
				history={shown}
				plans={plans}
				today={today}
				exams={targets}
				picked={anchor}
				several={targets.length > 1}
				onPick={go}
				onRemove={remove}
			/>
		</Screen>
	);
}
