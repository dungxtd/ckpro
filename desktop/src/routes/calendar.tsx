import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { Loading } from "@ckpro/ui/components/loading";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { AGENDA_WEEKS, Agenda } from "@/components/calendar/agenda";
import { ExamPicker } from "@/components/calendar/exam-picker";
import { ExamTargets } from "@/components/calendar/exam-targets";
import { Screen } from "@/components/shell/screen";
import { bestByDay, minutesByDay, startedAt } from "@/components/study/data";
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
	// The agenda runs from this week, or from the week picked when that is outside it
	const thisWeek = monday(parseDay(today));
	const agendaFrom =
		weekStart < thisWeek || weekStart >= addDays(thisWeek, 7 * AGENDA_WEEKS) ? weekStart : thisWeek;
	const agendaTo = dayKey(addDays(agendaFrom, 7 * AGENDA_WEEKS - 1));
	const from = [prepStart, dayKey(agendaFrom)].sort()[0];
	const to = [agendaTo, lastExam ?? today].sort().at(-1) as string;
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
				<h2 className="flex-1 truncate font-semibold text-lead">Agenda</h2>
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
				{anchor !== today && (
					<Button size="push" variant="push" onClick={() => go(today)}>
						Today
					</Button>
				)}
				{/* The day picked on the map, planned from here */}
				{anchor >= today && (
					<ExamPicker label={`Plan an exam, ${anchor}`} onPick={id => actions.onAdd(anchor, id)}>
						<Button size="push" variant="push">
							<Plus /> Plan on{" "}
							{anchor === today
								? "today"
								: parseDay(anchor).toLocaleDateString(undefined, {
										weekday: "short",
										day: "numeric",
										month: "short",
									})}
						</Button>
					</ExamPicker>
				)}
			</div>
			<Agenda
				from={agendaFrom}
				history={history}
				plans={plans}
				today={today}
				exams={targets}
				picked={anchor}
				restDays={targets[0]?.rest_days ?? []}
				several={aimed.length > 1}
				onAdd={actions.onAdd}
				onMode={actions.onMode}
				onRemove={actions.onRemove}
			/>
		</Screen>
	);
}
