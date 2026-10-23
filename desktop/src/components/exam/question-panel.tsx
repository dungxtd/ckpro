import { Button } from "@ckdry/ui/components/button";
import { Flag } from "lucide-react";
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
	const { flagged, hintsShown, checks, solutions } = useExam();
	const { toggleFlag, showHint, check, loadSolution } = useExam();
	const practice = attempt.mode === "practice";
	const multiCluster = attempt.clusters.length > 1;
	const hints = question.hints.slice(0, hintsShown[question.id] ?? 0);
	const result = checks[question.id];
	const solution = solutions[question.id];

	return (
		<div className="flex flex-col gap-3">
			<header className="flex items-start gap-2">
				<div className="flex-1">
					<div className="text-muted-foreground text-xs">
						Question {index + 1} of {attempt.questions.length} · weight {(question.weight ?? 0).toFixed(0)}
						%
					</div>
					<h2 className="font-semibold">{question.title}</h2>
				</div>
				<Button
					size="sm"
					variant={flagged.includes(question.id) ? "default" : "outline"}
					onClick={() => toggleFlag(question.id)}
				>
					<Flag className="size-4" /> Flag
				</Button>
			</header>

			<div className="rounded-md border border-border bg-muted/40 p-2 font-mono text-xs">
				{multiCluster && <div>kubectl config use-context {question.cluster}</div>}
				{question.namespace && (
					<div className="text-muted-foreground"># namespace: {question.namespace}</div>
				)}
				{!multiCluster && !question.namespace && (
					<div className="text-muted-foreground"># cluster: {question.cluster}</div>
				)}
			</div>

			<Markdown>{question.statement}</Markdown>

			{question.references.length > 0 && (
				<div className="text-xs">
					<div className="text-muted-foreground">Allowed documentation</div>
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
