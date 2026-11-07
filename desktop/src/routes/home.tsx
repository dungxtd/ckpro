import { Loading } from "@ckpro/ui/components/loading";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PrepMap } from "@/components/home/prep-map";
import { Readiness } from "@/components/home/readiness";
import { StatusTerminal } from "@/components/home/status-terminal";
import { Today } from "@/components/home/today";
import { Week } from "@/components/home/week";
import { Screen } from "@/components/shell/screen";
import {
	bestByDay,
	daysUntil,
	events,
	startedAt,
	studyFigures,
	suggestion,
	weakest,
	worked,
} from "@/components/study/data";
import { addDays, dayKey, monday, parseDay } from "@/days";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import { type ExamReadiness, examApi, type HistoryEntry, type PlanView } from "@/tauri/api";

/**
 * Home: where the preparation stands (as kubectl would print it), today's
 * session, the prep map, readiness per domain and this week's plans (the
 * week in figures is the Calendar's). All of it from the attempts and the
 * plans, without AI; read again whenever an attempt is over
 */
export function HomeRoute() {
	const target = useSettings(s => s.settings.target);
	const catalog = useExam(s => s.catalog);
	const idle = useExam(s => !s.state || s.state.phase === "idle");
	const [history, setHistory] = useState<HistoryEntry[] | null>(null);
	const [plans, setPlans] = useState<PlanView[]>([]);
	const [readiness, setReadiness] = useState<ExamReadiness | null>(null);
	const navigate = useNavigate();

	const now = new Date();
	const today = dayKey(now);
	const weekStart = monday(now);
	const certifications = [...new Set(catalog.map(e => e.certification))];
	// The certification measured: the target's, else the latest attempt's
	const certification =
		target?.certification ?? (history?.find(h => h.certification)?.certification || null) ?? null;

	// Read again whenever an attempt is over, the exams change (one deleted
	// takes its plans) and for a new week
	const week = dayKey(weekStart);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the exams changing is the cue
	useEffect(() => {
		if (!idle) return;
		examApi.history().then(setHistory);
		examApi.plans(week, dayKey(addDays(parseDay(week), 6))).then(setPlans);
	}, [idle, week, catalog]);
	useEffect(() => {
		if (certification && idle)
			examApi.readiness(certification).then(setReadiness, () => setReadiness(null));
	}, [certification, idle]);

	if (history === null) return <Loading fill label="Loading your attempts…" />;
	const measured = certification ? history.filter(h => h.certification === certification) : history;
	const weak = weakest(readiness);
	// The certification's longest exam measures the most domains at once
	const mock = catalog
		.filter(e => e.certification === certification)
		.reduce<(typeof catalog)[number] | null>(
			(m, e) => (!m || e.questions > m.questions ? e : m),
			null
		);
	const first = measured.filter(worked).at(-1);
	const start = target
		? parseDay(target.started)
		: first
			? new Date(startedAt(first))
			: addDays(now, -70);
	const end = target ? parseDay(target.date) : now;
	return (
		<Screen
			title="Home"
			actions={
				<span className="text-callout text-muted-foreground">
					{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
				</span>
			}
			// Wider windows give the cards room; narrow ones stack them
			width="wide"
			className="@container gap-4"
		>
			<div className="grid gap-4 @3xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
				<StatusTerminal
					target={target}
					days={target ? daysUntil(target.date, now) : null}
					readiness={readiness}
					events={events(measured, readiness)}
					certifications={certifications}
					certification={certification}
				/>
				<Today
					plans={plans.filter(p => p.day === today)}
					today={today}
					suggested={suggestion(catalog, measured, certification)}
				/>
			</div>
			{/* The map takes the room; Readiness beside it stays compact */}
			<div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_18rem] @6xl:grid-cols-[minmax(0,1fr)_22rem]">
				<PrepMap
					start={start}
					end={end}
					exam={target?.date ?? null}
					best={bestByDay(measured)}
					pass={readiness?.pass_score ?? 66}
					figures={studyFigures(measured, now)}
				/>
				<Readiness
					readiness={readiness}
					onMeasure={mock ? () => navigate(`/exams?exam=${mock.id}`) : null}
					onPractise={weak ? () => navigate("/exams") : null}
				/>
			</div>
			<Week plans={plans} weekStart={weekStart} restDays={target?.rest_days ?? []} />
		</Screen>
	);
}
