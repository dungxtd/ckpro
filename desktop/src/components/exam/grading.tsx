import { Card } from "@ckpro/ui/components/card";
import { Spinner } from "@ckpro/ui/components/spinner";
import { cn } from "@ckpro/ui/lib/utils";
import type { ReactNode, Ref } from "react";
import { ActivityProgress } from "@/components/activity/activity-progress";
import { scoreText } from "@/components/study/data";
import type { Attempt, ExamState, QuestionScore } from "@/tauri/api";

type Scores = Extract<ExamState, { phase: "grading" }>["scores"];

/** Grading: each question's score appears as soon as its checks are in. */
export function Grading({
	attempt,
	activity,
	scores,
	note,
}: {
	attempt: Attempt;
	activity: number;
	scores: Scores;
	note: string | null;
}) {
	return (
		<div className="flex h-full items-center justify-center overflow-auto p-6">
			<GradingCard
				head={<ActivityProgress id={activity} note={note ?? undefined} />}
				titles={attempt.questions.map(q => q.title)}
				scores={scores}
			/>
		</div>
	);
}

/** Grading's card: how it goes (`head`), then each question's score. The
 * first passed exam shows it again, graded, to stamp it (`FirstPass`) */
export function GradingCard({
	head,
	titles,
	scores,
	ref,
}: {
	head: ReactNode;
	titles: string[];
	scores: (QuestionScore | null | undefined)[];
	ref?: Ref<HTMLDivElement>;
}) {
	return (
		<Card ref={ref} padding="lg" className="flex w-full max-w-2xl flex-col gap-4 text-left">
			{head}
			<ScoreList titles={titles} scores={scores} />
		</Card>
	);
}

/** Each question's score as it is in, a spinner until then */
function ScoreList({
	titles,
	scores,
}: {
	titles: string[];
	scores: (QuestionScore | null | undefined)[];
}) {
	return (
		<ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
			{titles.map((title, i) => {
				const score = scores[i];
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: the questions' order is fixed
					<li key={i} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
						<span className="w-6 text-right text-muted-foreground tabular-nums">{i + 1}</span>
						<span className="min-w-0 flex-1 truncate">{title}</span>
						{score ? (
							<span
								className={cn(
									"font-mono text-caption tabular-nums",
									scoreText((score.points / score.max_points) * 100, 100)
								)}
							>
								{score.points}/{score.max_points}
							</span>
						) : (
							<Spinner size="inline" className="text-muted-foreground" />
						)}
					</li>
				);
			})}
		</ol>
	);
}
