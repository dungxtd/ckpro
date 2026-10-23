import { Button } from "@ckdry/ui/components/button";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { useExam } from "@/stores/exam";
import type { Attempt, ExamResult } from "@/tauri/api";
import { CheckList } from "./check-list";

/** The result like the exam gives it (score, pass/fail), then the review. */
export function Results({ attempt, result }: { attempt: Attempt; result: ExamResult }) {
	const { solutions, loadSolution, end } = useExam();
	const [review, setReview] = useState(false);
	const minutes = Math.round(((result.finished_at ?? 0) - (result.started_at ?? 0)) / 60000);

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
			<section className="rounded-lg border border-border bg-card p-6 text-center">
				<div className="text-muted-foreground text-sm">{attempt.title}</div>
				<div
					className={`my-2 font-bold text-5xl ${result.passed ? "text-green-500" : "text-red-500"}`}
				>
					{result.score}%
				</div>
				<div className="font-semibold">{result.passed ? "PASS" : "FAIL"}</div>
				<div className="text-muted-foreground text-sm">
					Passing score {attempt.pass_score}% · {minutes} min
				</div>
				<div className="mt-4 flex justify-center gap-2">
					{!review && <Button onClick={() => setReview(true)}>Review answers</Button>}
					<Button variant="outline" onClick={end}>
						Close exam (deletes its clusters)
					</Button>
				</div>
			</section>

			{review &&
				result.questions.map((q, i) => {
					const solution = solutions[q.id];
					return (
						<section key={q.id} className="rounded-lg border border-border bg-card p-4">
							<header className="mb-2 flex items-baseline gap-2">
								<strong>
									{i + 1}. {q.title}
								</strong>
								<span
									className={`ml-auto text-sm ${q.points === q.max_points ? "text-green-500" : "text-red-500"}`}
								>
									{q.points}/{q.max_points}
								</span>
							</header>
							<CheckList checks={q.checks} />
							{solution ? (
								<div className="mt-3 border-border border-t pt-2">
									<Markdown>{solution.explain}</Markdown>
									<pre className="mt-2 overflow-auto rounded bg-muted p-2 font-mono text-xs">
										{solution.run}
									</pre>
								</div>
							) : (
								<Button
									size="sm"
									variant="ghost"
									className="mt-2"
									onClick={() => loadSolution(q.id)}
								>
									Show solution
								</Button>
							)}
						</section>
					);
				})}
		</div>
	);
}
