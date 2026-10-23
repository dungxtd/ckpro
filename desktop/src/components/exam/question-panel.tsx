import { Button } from "@ckdry/ui/components/button";
import { Markdown } from "@/components/markdown";
import { useExam } from "@/stores/exam";
import type { Attempt, QuestionView } from "@/tauri/api";
import { CheckList } from "./check-list";

/** One task as the exam shows it, plus the practice-mode aids. */
export function QuestionPanel({
	attempt,
	question,
	index,
}: {
	attempt: Attempt;
	question: QuestionView;
	index: number;
}) {
	const { hintsShown, checks, solutions } = useExam();
	const { showHint, check, loadSolution } = useExam();
	const practice = attempt.mode === "practice";
	const hints = question.hints.slice(0, hintsShown[question.id] ?? 0);
	const result = checks[question.id];
	const solution = solutions[question.id];

	return (
		<div className="flex flex-col gap-3">
			<header>
				<div className="text-muted-foreground text-xs">
					Question {index + 1} · weight {(question.weight ?? 0).toFixed(0)}%
				</div>
				<h2 className="font-semibold">{question.title}</h2>
			</header>

			{/* The exam's task infobox: where to solve it */}
			<div className="rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
				<div>You must connect to the correct host.</div>
				<div>Failure to do so may result in a zero score.</div>
				<pre className="mt-2 select-text font-mono text-xs">
					[candidate@base] $ ssh {question.host}
				</pre>
				{question.namespace && (
					<div className="mt-1 text-muted-foreground text-xs">Namespace: {question.namespace}</div>
				)}
			</div>

			<Markdown>{question.statement}</Markdown>

			{question.references.length > 0 && (
				<div className="text-xs">
					<div className="text-muted-foreground">Quick Reference</div>
					{question.references.map(url => (
						<div key={url} className="truncate font-mono">
							{url}
						</div>
					))}
				</div>
			)}

			{practice && (
				<section className="flex flex-col gap-2 border-border border-t pt-3">
					<div className="flex flex-wrap gap-2">
						<Button size="sm" onClick={() => check(question.id)} disabled={result === "running"}>
							{result === "running" ? "Checking…" : "Check my work"}
						</Button>
						{hints.length < question.hints.length && (
							<Button size="sm" variant="outline" onClick={() => showHint(question.id)}>
								Hint ({hints.length + 1}/{question.hints.length})
							</Button>
						)}
						<Button
							size="sm"
							variant="ghost"
							onClick={() => loadSolution(question.id)}
							disabled={!!solution}
						>
							Show solution
						</Button>
					</div>
					{hints.map((hint, i) => (
						<div key={hint} className="rounded-md bg-amber-500/10 p-2 text-sm">
							<strong>Hint {i + 1}.</strong> {hint}
						</div>
					))}
					{Array.isArray(result) && <CheckList checks={result} />}
					{solution && (
						<div className="rounded-md border border-border p-2">
							<Markdown>{solution.explain}</Markdown>
							<pre className="mt-2 overflow-auto rounded bg-muted p-2 font-mono text-xs">
								{solution.run}
							</pre>
						</div>
					)}
				</section>
			)}
		</div>
	);
}
