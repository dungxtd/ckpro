import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Separator } from "@ckdry/ui/components/separator";
import { Stepper } from "@ckdry/ui/components/stepper";
import { cn } from "@ckdry/ui/lib/utils";
import { Lightbulb } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import type { Attempt, QuestionView } from "@/tauri/api";
import { CheckList } from "./check-list";
import { CopyText } from "./copy-text";

/** Question text sizes, in px (the text size stepper) */
const SIZES = [
	{ px: 13, className: "text-[13px]" },
	{ px: 14, className: "text-sm" },
	{ px: 16, className: "text-base" },
	{ px: 18, className: "text-lg" },
];

/** One task as the exam shows it, plus the practice-mode aids. */
export function QuestionPanel({ attempt, question }: { attempt: Attempt; question: QuestionView }) {
	const { hintsShown, checks, solutions } = useExam();
	const { showHint, check, loadSolution } = useExam();
	const askCoach = useCoach(s => s.ask);
	const practice = attempt.mode === "practice";
	const hints = question.hints.slice(0, hintsShown[question.id] ?? 0);
	const result = checks[question.id];
	const solution = solutions[question.id];
	const { settings } = useSettings();
	const size = Math.min(SIZES.length - 1, settings.question_size);
	const code = "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-exam-value";

	return (
		<div className={cn("flex flex-col gap-3", SIZES[size]?.className)}>
			<div className="flex flex-wrap items-center gap-2">
				<span>Solve this question on instance:</span>
				<CopyText className={code} text={`ssh ${question.host}`} />
			</div>
			{question.namespace && (
				<div>
					Namespace: <CopyText className={code} text={question.namespace} />
				</div>
			)}
			{question.tags.length > 0 && (
				<div>
					Concepts: <span className="font-mono text-exam-concept">{question.tags.join(", ")}</span>
				</div>
			)}
			<div className="text-muted-foreground text-xs">
				Weight {(question.weight ?? 0).toFixed(0)}% · You must connect to the correct host; working
				on the wrong one may score zero.
			</div>
			<Separator />

			<Markdown copy>{question.statement}</Markdown>

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
				<section className="flex flex-col gap-2">
					<Separator className="mb-1" />
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
						<Alert key={hint} variant="warning">
							<Lightbulb />
							<p>
								<strong>Hint {i + 1}.</strong> {hint}
							</p>
						</Alert>
					))}
					{Array.isArray(result) && (
						<CheckList
							checks={result}
							onWhy={c =>
								askCoach(
									question.id,
									`Why does the check "${c.name}" fail${c.detail ? ` (${c.detail})` : ""}? Point me to the cause, not the full solution.`
								)
							}
						/>
					)}
					{solution && (
						<Card padding="sm" className="flex flex-col gap-2">
							<Markdown copy>{solution.explain}</Markdown>
							<CopyText block text={solution.run.replace(/\n$/, "")} />
						</Card>
					)}
				</section>
			)}
		</div>
	);
}

/** The question's text size, kept in the app database */
export function TextSize() {
	const { settings, update } = useSettings();
	const size = Math.min(SIZES.length - 1, settings.question_size);
	return (
		<Stepper
			label="Text size"
			value={`${SIZES[size]?.px} px`}
			onDecrement={() => update({ question_size: size - 1 })}
			onIncrement={() => update({ question_size: size + 1 })}
			decrementDisabled={size === 0}
			incrementDisabled={size === SIZES.length - 1}
		/>
	);
}
