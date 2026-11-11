import { Loading } from "@ckpro/ui/components/loading";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { DockerBanner } from "@/components/environment/docker-banner";
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
import { useStudy } from "@/stores/study";
import { type ExamReadiness, examApi, type PlanView } from "@/tauri/api";

/**
 * Home: where the preparation stands (as kubectl would print it), today's
 * session, the prep map, readiness per domain and this week's plans (the
 * week in figures is the Calendar's). All of it from the attempts and the
 * plans, without AI; read again whenever Rust says the study changed
 */
export function HomeRoute() {
	const target = useSettings(s => s.settings.target);
	const catalog = useExam(s => s.catalog);
	const history = useStudy(s => s.history);
	// Bumped when Rust says the study changed: the week's plans and the
	// readiness are read again then
	const version = useStudy(s => s.version);
	// What was read, and for which week or certification: one that is not
	// the current one is still being read (a new version reads again, but
	// keeps what it had until the answer comes). `null`: the read failed,
	// shown as such rather than as nothing planned or nothing measured
	const [planned, setPlanned] = useState<{ week: string; plans: PlanView[] | null }>({
		week: "",
		plans: [],
	});
	const [measuredBy, setMeasuredBy] = useState<{
		certification: string | null;
		readiness: ExamReadiness | null;
		failed: boolean;
	}>({ certification: null, readiness: null, failed: false });
	// Bumped by Try again: the failed read is made again
	const [retry, setRetry] = useState(0);
	const navigate = useNavigate();

	const now = new Date();
	const today = dayKey(now);
	const weekStart = monday(now);
	const certifications = [...new Set(catalog.map(e => e.certification))];
	// The certification measured: the target's, else the latest attempt's
	const certification =
		target?.certification ?? (history?.find(h => h.certification)?.certification || null) ?? null;

	// The week's plans: again as the study changes, and for a new week
	const week = dayKey(weekStart);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version is the cue
	useEffect(() => {
		let current = true;
		examApi.plans(week, dayKey(addDays(parseDay(week), 6))).then(
			plans => current && setPlanned({ week, plans }),
			() => current && setPlanned({ week, plans: null })
		);
		return () => {
			current = false;
		};
	}, [week, version, retry]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version is the cue
	useEffect(() => {
		// No certification to measure (the target deleted, no attempt): none shown
		if (!certification) return;
		// An answer for a certification no longer measured is not shown
		let current = true;
		examApi.readiness(certification).then(
			readiness => current && setMeasuredBy({ certification, readiness, failed: false }),
			() => current && setMeasuredBy({ certification, readiness: null, failed: true })
		);
		return () => {
			current = false;
		};
	}, [certification, version, retry]);

	const plansRead = planned.week === week;
	const plans = plansRead ? (planned.plans ?? []) : [];
	const plansFailed = plansRead && planned.plans === null;
	const readinessRead = !certification || measuredBy.certification === certification;
	const readiness = certification && readinessRead ? measuredBy.readiness : null;
	const readinessFailed = !!certification && readinessRead && measuredBy.failed;
	// Try again: read once more, each read shown as being read meanwhile
	const again = () => {
		if (plansFailed) setPlanned({ week: "", plans: [] });
		if (readinessFailed) setMeasuredBy({ certification: null, readiness: null, failed: false });
		setRetry(n => n + 1);
	};

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
			<DockerBanner />
			{/* Side by side once the terminal's table fits on its lines (the default
			    window does) */}
			<div className="grid gap-4 @min-[45rem]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
				<StatusTerminal
					target={target}
					days={target ? daysUntil(target.date, now) : null}
					readiness={readiness}
					events={events(measured, readiness)}
					certifications={certifications}
					certification={certification}
				/>
				<Today
					plans={plansRead ? plans.filter(p => p.day === today) : null}
					failed={plansFailed}
					onRetry={again}
					today={today}
					suggested={suggestion(catalog, measured, certification)}
				/>
			</div>
			{/* The map takes the room; Readiness beside it stays compact. Side by side
			    from the default window up (sidebar shown), stacked only when narrower */}
			<div className="grid gap-4 @2xl:grid-cols-[minmax(0,1fr)_18rem] @6xl:grid-cols-[minmax(0,1fr)_22rem]">
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
					state={readinessFailed ? "failed" : readinessRead ? "read" : "reading"}
					onRetry={again}
					onMeasure={mock ? () => navigate(`/exams?exam=${mock.id}`) : null}
					onPractise={weak ? () => navigate("/exams") : null}
				/>
			</div>
			<Week
				plans={plansRead ? plans : null}
				failed={plansFailed}
				onRetry={again}
				weekStart={weekStart}
				restDays={target?.rest_days ?? []}
			/>
		</Screen>
	);
}
