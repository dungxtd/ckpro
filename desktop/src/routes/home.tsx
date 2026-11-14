import { Loading } from "@ckpro/ui/components/loading";
import { useNavigate } from "react-router";
import { DockerBanner } from "@/components/environment/docker-banner";
import type { Places } from "@/components/home/layout";
import { ModuleGrid, type ModuleSpec } from "@/components/home/module-grid";
import { AskClaude } from "@/components/home/modules/ask-claude";
import { Domains } from "@/components/home/modules/domains";
import { ExamDay } from "@/components/home/modules/exam-day";
import { InProgress } from "@/components/home/modules/in-progress";
import { ModuleCard } from "@/components/home/modules/module-card";
import { Passed } from "@/components/home/modules/passed";
import { Readiness } from "@/components/home/modules/readiness";
import { Recent } from "@/components/home/modules/recent";
import { RetryList } from "@/components/home/modules/retry-list";
import { ThisWeek } from "@/components/home/modules/this-week";
import { Today } from "@/components/home/modules/today";
import { useHomeData } from "@/components/home/use-home-data";
import { Screen } from "@/components/shell/screen";
import { longestStreak, PASS_DEFAULT } from "@/components/study/data";
import { ExamMenu } from "@/components/study/exam-menu";
import { PracticeMap } from "@/components/study/practice-map";
import { streak } from "@/days";
import { useAssistantEnabled } from "@/stores/settings";
import { plural } from "@/words";

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
 * With several exams, one in focus or all (the exam menu beside the title,
 * as on the Calendar). The figures come from `useHomeData`
 */
export function HomeRoute() {
	const data = useHomeData();
	const assistant = useAssistantEnabled();
	const navigate = useNavigate();

	if (data === null) return <Loading fill label="Loading your attempts…" />;
	const { now, history, measured, days, minutes, planDays, several, fresh, again } = data;

	const modules: ModuleSpec[] = [
		{
			id: "today",
			name: "Today",
			size: "l",
			node: (
				<Today
					plans={data.todayPlans}
					failed={data.plansFailed}
					onRetry={again}
					today={data.today}
					suggested={data.suggested}
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
						node: <AskClaude suggestions={data.suggestions} />,
					},
				]
			: []),
		{ id: "exam-day", name: "Exam day", size: "w", node: <ExamDay targets={data.targets} /> },
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
						start={data.mapStart}
						exams={data.targets}
						minutes={minutes}
						best={data.best}
						pass={measured[0]?.readiness?.pass_score ?? PASS_DEFAULT}
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
					{ id: "passed", name: "Passed", size: "s" as const, node: <Passed history={history} /> },
					{
						id: "in-progress",
						name: "In progress",
						size: "s" as const,
						node: <InProgress exams={data.unpassed} />,
					},
					{
						id: "retry",
						name: "Retry list",
						size: "l" as const,
						node: <RetryList retries={data.retries} several={several} />,
					},
					{
						id: "week",
						name: "This week",
						size: "w" as const,
						node: (
							<ThisWeek
								minutes={minutes}
								attempts={data.weekAttempts}
								plans={data.weekPlans}
								weekStart={data.weekStart}
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
								onMeasure={data.mock ? () => navigate(`/exams?exam=${data.mock?.id}`) : null}
							/>
						),
					},
					{
						id: "recent",
						name: "Recent",
						// Grows with the history: one row for a couple, two for more
						size: history.length > 2 ? ("y" as const) : ("x" as const),
						node: <Recent history={history} several={several} />,
					},
				]),
	];

	return (
		<Screen
			title="Home"
			// The exams aimed at, which the whole screen shows; changed or added there
			accessory={<ExamMenu />}
			width="wide"
			className="gap-4"
		>
			<p className="-mt-2 text-callout text-muted-foreground">
				{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
			</p>
			<DockerBanner />
			<ModuleGrid
				modules={modules}
				defaults={DEFAULTS[(fresh ? "new" : "used") + (assistant ? "" : "NoAi")]}
			/>
		</Screen>
	);
}
