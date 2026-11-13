import { Alert } from "@ckpro/ui/components/alert";
import { Button } from "@ckpro/ui/components/button";
import { inlineCode } from "@ckpro/ui/components/inline-code";
import { Separator } from "@ckpro/ui/components/separator";
import { Stepper } from "@ckpro/ui/components/stepper";
import { cn } from "@ckpro/ui/lib/utils";
import { Eye, Lightbulb, ListChecks } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { CheckList } from "@/components/exam/check-list";
import { CopyBlock, CopyText } from "@/components/text/copy-text";
import { DocList } from "@/components/text/doc-link";
import { Markdown } from "@/components/text/markdown";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled, useSettings } from "@/stores/settings";
import type { Attempt, QuestionView } from "@/tauri/api";

/** Question text sizes, in px (the text size stepper) */
const SIZES = [
	{ px: 13, className: "text-callout" },
	{ px: 14, className: "text-sm" },
	{ px: 16, className: "text-base" },
	{ px: 18, className: "text-lg" },
];

/** What the question panel shows: the task, or (practice) its solution */
export type PanelView = "task" | "solution";

/** One task as the exam shows it, plus the practice-mode aids; or its
 * reference solution (practice), on a tab of its own */
export function QuestionPanel({
	attempt,
	question,
	view = "task",
}: {
	attempt: Attempt;
	question: QuestionView;
	view?: PanelView;
}) {
	const { hintsShown, checks } = useExam(
		useShallow(s => ({ hintsShown: s.hintsShown, checks: s.checks }))
	);
	const askCoach = useCoach(s => s.ask);
	const assistant = useAssistantEnabled();
	const practice = attempt.mode === "practice";
	const hints = question.hints.slice(0, hintsShown[question.id] ?? 0);
	const result = checks[question.id];
	const solution = useExam(s => s.solutions[question.id]);
	const loadSolution = useExam(s => s.loadSolution);
	const questionSize = useSettings(s => s.settings.question_size);
	const size = Math.min(SIZES.length - 1, questionSize);
	// The host and namespace to copy, as values in the text are drawn
	const code = cn(inlineCode, "text-exam-value");

	if (view === "solution")
		return (
			<div className={cn("flex flex-col gap-3", SIZES[size]?.className)}>
				{solution ? (
					<>
						<Markdown copy className={SIZES[size]?.className}>
							{solution.explain}
						</Markdown>
						<CopyBlock text={solution.run.replace(/\n$/, "")} lang="shell" />
					</>
				) : (
					<div className="flex flex-col items-start gap-3 py-2">
						<p className="text-muted-foreground">
							The reference solution: the commands that solve this task, and why. Opening it is
							noted, and the assistant knows you saw it.
						</p>
						<Button size="push" variant="push" onClick={() => loadSolution(question.id)}>
							<Eye /> Show solution
						</Button>
					</div>
				)}
			</div>
		);

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
			<div className="text-muted-foreground text-caption">
				Weight {(question.weight ?? 0).toFixed(0)}% · You must connect to the correct host; working
				on the wrong one may score zero.
			</div>
			<Separator />

			<Markdown copy className={SIZES[size]?.className}>
				{question.statement}
			</Markdown>

			{question.references.length > 0 && (
				<div className="flex flex-col gap-1 text-caption">
					<div className="text-muted-foreground">Quick reference</div>
					<DocList urls={question.references} />
				</div>
			)}

			{practice && (hints.length > 0 || Array.isArray(result)) && (
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
							onWhy={
								assistant
									? c =>
											askCoach(
												question.id,
												`Why does the check "${c.name}" fail${c.detail ? ` (${c.detail})` : ""}? Point me to the cause, not the full solution.`
											)
									: undefined
							}
						/>
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
	const { hintsShown, checks, showHint, check } = useExam(
		useShallow(s => ({
			hintsShown: s.hintsShown,
			checks: s.checks,
			showHint: s.showHint,
			check: s.check,
		}))
	);
	const opened = hintsShown[question.id] ?? 0;
	const running = checks[question.id] === "running";
	return (
		<div className="flex flex-wrap gap-2">
			<Button
				size="push"
				variant="push"
				className="flex-1"
				onClick={() => check(question.id)}
				disabled={running}
			>
				<ListChecks />
				{running ? "Checking…" : "Check my work"}
			</Button>
			{opened < question.hints.length && (
				<Button
					size="push"
					variant="push"
					className="tabular-nums"
					onClick={() => showHint(question.id)}
				>
					Hint {opened + 1}/{question.hints.length}
				</Button>
			)}
		</div>
	);
}

/** The question's text size, kept in the app database */
export function TextSize() {
	const update = useSettings(s => s.update);
	const questionSize = useSettings(s => s.settings.question_size);
	const size = Math.min(SIZES.length - 1, questionSize);
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
