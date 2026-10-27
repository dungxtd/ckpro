import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Separator } from "@ckdry/ui/components/separator";
import { Stepper } from "@ckdry/ui/components/stepper";
import { cn } from "@ckdry/ui/lib/utils";
import { Lightbulb, ListChecks } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import type { Attempt, QuestionView } from "@/tauri/api";
import { CheckList } from "./check-list";
import { CopyText } from "./copy-text";
import { DocLink } from "./doc-link";
import { useSolution } from "./use-solution";

/** Question text sizes, in px (the text size stepper) */
const SIZES = [
	{ px: 13, className: "text-[13px]" },
	{ px: 14, className: "text-sm" },
	{ px: 16, className: "text-base" },
	{ px: 18, className: "text-lg" },
];

/** One task as the exam shows it, plus the practice-mode aids. */
export function QuestionPanel({ attempt, question }: { attempt: Attempt; question: QuestionView }) {
	const { hintsShown, checks } = useExam();
	const askCoach = useCoach(s => s.ask);
	const practice = attempt.mode === "practice";
	const hints = question.hints.slice(0, hintsShown[question.id] ?? 0);
	const result = checks[question.id];
	const { solution } = useSolution(question.id);
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
						<DocLink key={url} href={url} className="block truncate font-mono">
							{url}
						</DocLink>
					))}
				</div>
			)}

			{practice && (hints.length > 0 || Array.isArray(result) || solution) && (
				<section className="flex flex-col gap-2">
					<Separator className="mb-1" />
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

/**
 * Practice mode's aids, kept in view under the task (the task scrolls): check
 * the work, open the next hint, show or hide the solution. What they bring
 * shows at the end of the task
 */
export function PracticeActions({ question }: { question: QuestionView }) {
	const { hintsShown, checks, showHint, check } = useExam();
	const { shown, label, toggle } = useSolution(question.id);
	const opened = hintsShown[question.id] ?? 0;
	const running = checks[question.id] === "running";
	return (
		<div className="flex flex-wrap gap-2">
			<Button
				size="sm"
				variant="outline"
				className="flex-1"
				onClick={() => check(question.id)}
				disabled={running}
			>
				<ListChecks />
				{running ? "Checking…" : "Check my work"}
			</Button>
			{opened < question.hints.length && (
				<Button size="sm" variant="outline" onClick={() => showHint(question.id)}>
					Hint {opened + 1}/{question.hints.length}
				</Button>
			)}
			<Button size="sm" variant="ghost" aria-expanded={shown} onClick={toggle}>
				{label}
			</Button>
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
