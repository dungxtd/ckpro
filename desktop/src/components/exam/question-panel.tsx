import { Button } from "@ckdry/ui/components/button";
import { cn } from "@ckdry/ui/lib/utils";
import { Markdown } from "@/components/markdown";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import type { Attempt, QuestionView } from "@/tauri/api";
import { CheckList } from "./check-list";

/** Question text sizes (the A- A A+ buttons) */
const SIZES = ["text-[13px]", "text-sm", "text-base", "text-lg"];

/** One task as the exam shows it, plus the practice-mode aids. */
export function QuestionPanel({ attempt, question }: { attempt: Attempt; question: QuestionView }) {
	const { hintsShown, checks, solutions } = useExam();
	const { showHint, check, loadSolution } = useExam();
	const practice = attempt.mode === "practice";
	const hints = question.hints.slice(0, hintsShown[question.id] ?? 0);
	const result = checks[question.id];
	const solution = solutions[question.id];
	// Kept in the app database
	const { settings, update } = useSettings();
	const size = Math.min(SIZES.length - 1, settings.question_size);
	const changeSize = (next: number) => update({ question_size: next });
	const code = "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-pink-400";

	return (
		<div className={cn("flex flex-col gap-3", SIZES[size])}>
			<div className="flex flex-wrap items-center gap-2">
				<span>Solve this question on instance:</span>
				<code className={cn(code, "select-all")}>ssh {question.host}</code>
				<div className="ml-auto flex overflow-hidden rounded-md border border-border text-xs">
					{(["A−", "A", "A+"] as const).map((label, i) => {
						const next =
							i === 0 ? Math.max(0, size - 1) : i === 1 ? 1 : Math.min(SIZES.length - 1, size + 1);
						return (
							<button
								key={label}
								type="button"
								className="px-2 py-1 hover:bg-accent"
								onClick={() => changeSize(next)}
								aria-label={["Smaller text", "Default text size", "Larger text"][i]}
							>
								{label}
							</button>
						);
					})}
				</div>
			</div>
			{question.namespace && (
				<div>
					Namespace: <code className={code}>{question.namespace}</code>
				</div>
			)}
			{question.tags.length > 0 && (
				<div>
					Concepts: <span className="font-mono text-sky-400">{question.tags.join(", ")}</span>
				</div>
			)}
			<div className="text-muted-foreground text-xs">
				Weight {(question.weight ?? 0).toFixed(0)}% · You must connect to the correct host; working
				on the wrong one may score zero.
			</div>
			<hr className="border-border" />

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
