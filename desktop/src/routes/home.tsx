import { Button } from "@ckpro/ui/components/button";
import { Loading } from "@ckpro/ui/components/loading";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { DockerBanner } from "@/components/environment/docker-banner";
import type { Places } from "@/components/home/layout";
import { ModuleGrid, type ModuleSpec } from "@/components/home/module-grid";
import {
	AskClaude,
	Domains,
	ExamDay,
	InProgress,
	type Measured,
	ModuleCard,
	Passed,
	Readiness,
	Recent,
	RetryList,
	ThisWeek,
} from "@/components/home/modules";
import { Today } from "@/components/home/today";
import { Screen } from "@/components/shell/screen";
import {
	bestByDay,
	longestStreak,
	minutesByDay,
	retryList,
	scoreOf,
	startedAt,
	suggestion,
	weakest,
	worked,
} from "@/components/study/data";
import { PracticeMap } from "@/components/study/practice-map";
import { addDays, dayKey, monday, parseDay, streak } from "@/days";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled, useFocus, useShownTargets, useTargets } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { examApi, type PlanView } from "@/tauri/api";
import { domainName, plural } from "@/words";

/** Where each module starts, before the candidate arranges Home: with and
 * without the Claude module, for someone with attempts or someone new */
const DEFAULTS: Record<string, Places> = {
	used: {
		today: { x: 0, y: 0 },
		claude: { x: 2, y: 0 },
		"exam-day": { x: 0, y: 2 },
		readiness: { x: 2, y: 2 },
		passed: { x: 3, y: 2 },
		map: { x: 0, y: 3 },
		retry: { x: 2, y: 3 },
		week: { x: 0, y: 5 },
		"in-progress": { x: 2, y: 5 },
		domains: { x: 3, y: 5 },
		recent: { x: 0, y: 6 },
	},
	usedNoAi: {
		today: { x: 0, y: 0 },
		"exam-day": { x: 2, y: 0 },
		readiness: { x: 2, y: 1 },
		passed: { x: 3, y: 1 },
		map: { x: 0, y: 2 },
		retry: { x: 2, y: 2 },
		week: { x: 0, y: 4 },
		"in-progress": { x: 2, y: 4 },
		domains: { x: 3, y: 4 },
		recent: { x: 0, y: 5 },
	},
	new: {
		today: { x: 0, y: 0 },
		claude: { x: 2, y: 0 },
		"exam-day": { x: 0, y: 2 },
		map: { x: 2, y: 2 },
	},
	newNoAi: { today: { x: 0, y: 0 }, "exam-day": { x: 2, y: 0 }, map: { x: 2, y: 1 } },
};

/**
 * Home: the candidate's modules, each where they put it: today's session,
 * the exam days, readiness, the practice map, the questions to retry, the
 * week, the domains, the latest attempts and, with the assistant on, Claude.
 * With several exams, one in focus or all. All of it from the attempts and
 * the plans; read again whenever Rust says the study changed
 */
export function HomeRoute() {
	const targets = useShownTargets();
	const aimed = useTargets();
	const [focus, setFocus] = useFocus();
	const assistant = useAssistantEnabled();
	const catalog = useExam(s => s.catalog);
	const history = useStudy(s => s.history);
	// Bumped when Rust says the study changed: the plans and the readiness
	// are read again then
	const version = useStudy(s => s.version);
	const [retry, setRetry] = useState(0);
	// Arranging Home (Manage modules)
	const [editing, setEditing] = useState(false);
	const navigate = useNavigate();

	const now = new Date();
	const today = dayKey(now);
	const weekStart = monday(now);
	// What is measured: the exams shown, else the latest attempt's certification
	const latest = history?.find(h => h.certification)?.certification || null;
	const certs = targets.length ? targets.map(t => t.certification) : latest ? [latest] : [];
	const certKey = certs.join(",");
	// The plans from this week to the last exam: the week, today and the map
	const from = dayKey(weekStart);
	const lastExam = [dayKey(addDays(weekStart, 6)), ...targets.map(t => t.date)]
		.sort()
		.at(-1) as string;
	const range = `${from}:${lastExam}`;
	const [planned, setPlanned] = useState<{ range: string; plans: PlanView[] | null }>({
		range: "",
		plans: [],
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version is the cue
	useEffect(() => {
		let current = true;
		examApi.plans(from, lastExam).then(
			plans => current && setPlanned({ range, plans }),
			() => current && setPlanned({ range, plans: null })
		);
		return () => {
			current = false;
		};
	}, [range, version, retry]);
	const [measuredBy, setMeasuredBy] = useState<{ key: string; list: Measured[] }>({
		key: "",
		list: [],
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version is the cue
	useEffect(() => {
		let current = true;
		const wanted = certKey ? certKey.split(",") : [];
		Promise.allSettled(wanted.map(c => examApi.readiness(c))).then(
			answers =>
				current &&
				setMeasuredBy({
					key: certKey,
					list: answers.map((a, i) => ({
						certification: wanted[i],
						readiness: a.status === "fulfilled" ? a.value : null,
						state: a.status === "fulfilled" ? "read" : "failed",
					})),
				})
		);
		return () => {
			current = false;
		};
	}, [certKey, version, retry]);
	const again = () => {
		setPlanned({ range: "", plans: [] });
		setMeasuredBy({ key: "", list: [] });
		setRetry(n => n + 1);
	};

	if (history === null) return <Loading fill label="Loading your attempts…" />;
	const plansRead = planned.range === range;
	const plansFailed = plansRead && planned.plans === null;
	const allPlans = plansRead ? (planned.plans ?? []) : [];
	const shownPlans =
		targets.length > 1 || aimed.length > 1
			? allPlans.filter(p => certs.includes(p.certification))
			: allPlans;
	const measured: Measured[] =
		measuredBy.key === certKey
			? measuredBy.list
			: certs.map(c => ({ certification: c, readiness: null, state: "reading" as const }));
	const several = aimed.length > 1;
	// An attempt's certification: its own, else its exam's (older attempts kept none)
	const certOf = (h: (typeof history)[number]) =>
		h.certification || catalog.find(e => e.id === h.exam_id)?.certification || "";
	const ofShown = several || focus ? history.filter(h => certs.includes(certOf(h))) : history;
	const fresh = history.length === 0;
	const minutes = minutesByDay(ofShown);
	const days = new Set(ofShown.filter(worked).map(h => dayKey(new Date(startedAt(h)))));
	const first = ofShown.filter(worked).at(-1);
	const start = targets.length
		? parseDay(targets.map(t => t.started).sort()[0])
		: first
			? new Date(startedAt(first))
			: addDays(now, -70);
	const planDays = new Map<string, string[]>();
	for (const p of shownPlans.filter(p => p.done === null && p.day > today))
		planDays.set(p.day, [...(planDays.get(p.day) ?? []), p.certification]);
	const retries = retryList(ofShown);
	// The exams tried and not passed yet, the latest first
	const unpassed = [...new Set(ofShown.filter(worked).map(h => h.exam_id))]
		.map(id => {
			const tries = ofShown.filter(h => h.exam_id === id && worked(h));
			return {
				examId: id,
				title: tries[0].title,
				best: Math.max(...tries.map(h => scoreOf(h))),
				pass: tries[0].pass_score,
			};
		})
		.filter(e => e.best < e.pass);
	const weekKeys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)));
	const weekAttempts = ofShown.filter(h =>
		weekKeys.includes(dayKey(new Date(startedAt(h))))
	).length;
	const weak = weakest(measured[0]?.readiness ?? null);
	const mock = catalog
		.filter(e => certs.includes(e.certification))
		.reduce<(typeof catalog)[number] | null>(
			(m, e) => (!m || e.questions > m.questions ? e : m),
			null
		);
	const suggestions = [
		weak && `${domainName(weak.domain).replace(/^./, c => c.toUpperCase())} drill`,
		retries.length > 0 && `Retry ${plural(retries.length, "failed question")}`,
		targets[0] &&
			`Mock ${targets[0].certification.toUpperCase()} for ${parseDay(targets[0].date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
	].filter((s): s is string => !!s);

	const modules: ModuleSpec[] = [
		{
			id: "today",
			name: "Today",
			size: "l",
			node: (
				<Today
					plans={plansRead ? shownPlans.filter(p => p.day === today) : null}
					failed={plansFailed}
					onRetry={again}
					today={today}
					suggested={suggestion(catalog, ofShown, certs[0] ?? null)}
					several={several}
				/>
			),
		},
		...(assistant
			? [
					{
						id: "claude",
						name: "Make an exam with Claude",
						size: "l" as const,
						node: <AskClaude suggestions={suggestions} />,
					},
				]
			: []),
		{ id: "exam-day", name: "Exam day", size: "w", node: <ExamDay targets={targets} /> },
		{
			id: "map",
			name: "Practice map",
			size: "l",
			node: (
				<ModuleCard
					title={
						<>
							Practice map{" "}
							<span className="font-normal text-muted-foreground">
								{days.size
									? `${plural(days.size, "day")}, ${Math.round([...minutes.values()].reduce((a, b) => a + b, 0) / 60)} h`
									: ""}
							</span>
						</>
					}
				>
					<p className="mb-2 flex gap-4 text-caption text-muted-foreground">
						{days.size ? (
							<>
								<span>
									Streak <b className="text-foreground">{plural(streak(days, now), "day")}</b>
								</span>
								<span>
									Longest <b className="text-foreground">{plural(longestStreak(days), "day")}</b>
								</span>
							</>
						) : (
							<span>Each day you practise fills a square</span>
						)}
						{planDays.size > 0 && (
							<span>
								Planned <b className="text-foreground">{planDays.size}</b>
							</span>
						)}
					</p>
					<PracticeMap
						mode="activity"
						start={start}
						exams={targets}
						minutes={minutes}
						best={bestByDay(ofShown)}
						pass={measured[0]?.readiness?.pass_score ?? 66}
						planned={planDays}
						onPick={day => navigate(`/calendar?day=${day}`)}
					/>
				</ModuleCard>
			),
		},
		...(fresh
			? []
			: [
					{
						id: "readiness",
						name: "Readiness",
						size: "s" as const,
						node: <Readiness measured={measured} onRetry={again} />,
					},
					{ id: "passed", name: "Passed", size: "s" as const, node: <Passed history={ofShown} /> },
					{
						id: "in-progress",
						name: "In progress",
						size: "s" as const,
						node: <InProgress exams={unpassed} />,
					},
					{
						id: "retry",
						name: "Retry list",
						size: "l" as const,
						node: <RetryList retries={retries} several={several} />,
					},
					{
						id: "week",
						name: "This week",
						size: "w" as const,
						node: (
							<ThisWeek
								minutes={minutes}
								attempts={weekAttempts}
								plans={plansRead ? shownPlans.filter(p => weekKeys.includes(p.day)) : null}
								weekStart={weekStart}
							/>
						),
					},
					{
						id: "domains",
						name: "Domains",
						size: "t" as const,
						node: (
							<Domains
								measured={measured}
								onRetry={again}
								onMeasure={mock ? () => navigate(`/exams?exam=${mock.id}`) : null}
							/>
						),
					},
					{
						id: "recent",
						name: "Recent",
						// Grows with the history: one row for a couple, two for more
						size: ofShown.length > 2 ? ("y" as const) : ("x" as const),
						node: <Recent history={ofShown} several={several} />,
					},
				]),
	];

	return (
		<Screen
			title="Home"
			actions={
				<div className="flex items-center gap-2">
					{aimed.length > 1 && (
						<SegmentedControl
							label="Exams shown"
							value={focus ?? "all"}
							onChange={v => setFocus(v === "all" ? null : v)}
							options={[
								{ value: "all", label: "All exams" },
								...aimed.map(t => ({
									value: t.certification,
									label: t.certification.toUpperCase(),
								})),
							]}
						/>
					)}
					<Button
						size="push"
						variant="push"
						aria-pressed={editing}
						disabled={editing}
						onClick={() => setEditing(true)}
					>
						<SlidersHorizontal /> Manage modules
					</Button>
				</div>
			}
			width="wide"
			className="gap-4"
		>
			<p className="-mt-2 text-callout text-muted-foreground">
				{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
				{targets[0] &&
					` · ${targets[0].certification.toUpperCase()} in ${plural(Math.max(0, Math.round((parseDay(targets[0].date).getTime() - parseDay(today).getTime()) / 86_400_000)), "day")}`}
				{targets.length > 1 && `, ${targets.length - 1} more after it`}
			</p>
			<DockerBanner />
			<ModuleGrid
				editing={editing}
				onEditing={setEditing}
				modules={modules}
				defaults={DEFAULTS[(fresh ? "new" : "used") + (assistant ? "" : "NoAi")]}
			/>
		</Screen>
	);
}
