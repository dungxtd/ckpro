import { Card } from "@cktry/ui/components/card";
import { Spinner } from "@cktry/ui/components/spinner";
import { cn } from "@cktry/ui/lib/utils";
import { ActivityProgress } from "@/components/activity/activity-progress";
import type { Attempt, ExamState } from "@/tauri/api";

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
			<Card padding="lg" className="flex w-full max-w-2xl flex-col gap-4">
				<ActivityProgress id={activity} note={note ?? undefined} />
				<ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
					{attempt.questions.map((q, i) => {
						const score = scores[i];
						const full = score && score.points === score.max_points;
						const zero = score && score.points === 0;
						return (
							<li key={q.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
								<span className="w-6 text-right text-muted-foreground tabular-nums">{i + 1}</span>
								<span className="min-w-0 flex-1 truncate">{q.title}</span>
								{score ? (
									<span
										className={cn(
											"font-mono text-xs tabular-nums",
											full ? "text-success" : zero ? "text-destructive" : "text-warning"
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
			</Card>
		</div>
	);
}
