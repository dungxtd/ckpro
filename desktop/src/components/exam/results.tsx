import { Alert } from "@ckpro/ui/components/alert";
import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { Disclosure } from "@ckpro/ui/components/disclosure";
import { Progress } from "@ckpro/ui/components/progress";
import { SectionTitle } from "@ckpro/ui/components/section-title";
import { Separator } from "@ckpro/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@ckpro/ui/components/sheet";
import { cn } from "@ckpro/ui/lib/utils";
import { Circle, CircleCheck, CircleDashed, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { AssistantPane } from "@/components/assistant/assistant-pane";
import { CheckList } from "@/components/exam/check-list";
import { useSolution } from "@/components/exam/use-solution";
import { WhatNext } from "@/components/exam/what-next";
import { scoreText, scoreTone, TONE_TEXT } from "@/components/study/data";
import { CopyBlock } from "@/components/text/copy-text";
import { Markdown } from "@/components/text/markdown";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled } from "@/stores/settings";
import type { Attempt, ExamResult } from "@/tauri/api";
import { certName, NONE, plural } from "@/words";

/**
 * The result: the score in its colour against the pass line, what it means
 * for the exam aimed at, what to do next, then each question, opened in place.
 */
export function Results({ attempt, result }: { attempt: Attempt; result: ExamResult }) {
	const end = useExam(s => s.end);
	const exam = useExam(s => s.catalog.find(e => e.id === attempt.exam_id));
	// The questions opened below; the coach's, in a side sheet
	const [open, setOpen] = useState<Set<string>>(new Set());
	const [coached, setCoached] = useState<string | null>(null);
	const assistant = useAssistantEnabled();
	const coachedResult = result.questions.find(q => q.id === coached);
	const coachedQuestion = attempt.questions.find(q => q.id === coached);
	// The time taken, when both ends are known (none made up from a missing start)
	const minutes =
		result.started_at !== null && result.finished_at !== null
			? `${Math.round((result.finished_at - result.started_at) / 60000)}`
			: NONE;
	const pass = attempt.pass_score;
	const score = result.score ?? 0;
	const tone = scoreTone(score, pass);
	const full = result.questions.filter(q => q.points === q.max_points).length;
	const missed = result.questions.filter(q => q.points < q.max_points);
	const toggle = (id: string, shown: boolean) =>
		setOpen(o => {
			const next = new Set(o);
			if (shown) next.add(id);
			else next.delete(id);
			return next;
		});

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
			<Card padding="lg" className="flex flex-col gap-4">
				<div className="flex items-start gap-3">
					<div className="min-w-0 flex-1">
						<div className="text-muted-foreground text-sm">
							{attempt.title} · {attempt.mode === "practice" ? "Practice" : "Exam"}
						</div>
						<div className="mt-1.5 flex flex-wrap items-center gap-2.5">
							{/* One tone for the score, its badge and its bar: passing, near
							    the pass line, far under it */}
							<span className={cn("font-semibold text-display tabular-nums", TONE_TEXT[tone])}>
								{result.score === null ? NONE : `${score}%`}
							</span>
							<Badge variant={result.passed ? "success" : tone}>
								{result.passed ? "Passed" : "Failed"}
							</Badge>
						</div>
					</div>
					<ConfirmDialog
						title="Close this exam?"
						description="Its clusters, task host files and desktop are deleted. The result stays in History."
						action="Close exam"
						cancel="Keep reviewing"
						onConfirm={end}
					>
						<Button size="push" variant="push">
							Close exam
						</Button>
					</ConfirmDialog>
				</div>
				<Progress value={score} marker={pass} tone={tone} label="Score" />
				<div className="text-muted-foreground text-sm tabular-nums">
					{full} of {plural(result.questions.length, "question")} in full · pass line {pass}%{" · "}
					{exam ? `${minutes} of ${exam.duration_minutes} min` : `${minutes} min`}
				</div>
				<PredictionLine
					certification={attempt.certification}
					before={result.prediction?.before ?? null}
					after={result.prediction?.after ?? null}
					pass={pass}
				/>
				{result.outside.length > 0 && (
					<Alert variant="warning">
						<ShieldAlert />
						<div>
							<strong>Changed outside the exam desktop</strong>
							<ul className="mt-1 list-disc pl-5 text-muted-foreground">
								{result.outside.map(o => (
									<li key={o}>{o}</li>
								))}
							</ul>
						</div>
					</Alert>
				)}
			</Card>

			<WhatNext
				attempt={attempt}
				result={result}
				missed={missed}
				onShowMissed={() => setOpen(new Set(missed.map(q => q.id)))}
			/>

			<section className="flex flex-col gap-2">
				<SectionTitle>Questions</SectionTitle>
				<Card padding="none" className="overflow-hidden">
					{result.questions.map((q, i) => (
						<Disclosure
							key={q.id}
							open={open.has(q.id)}
							onOpenChange={shown => toggle(q.id, shown)}
							className="border-border not-first:border-t"
							summary={
								<>
									<Mark points={q.points} max={q.max_points} />
									<span className="min-w-0 flex-1 truncate">
										{i + 1}. {q.title}
									</span>
									{/* Claude ran commands for it (Agent): the points were helped */}
									{result.assisted?.includes(q.id) && (
										<Badge variant="subtle" className="shrink-0 gap-1">
											<AssistantIcon className="size-3 text-assistant" /> Assistant helped
										</Badge>
									)}
									<span
										className={cn(
											"w-10 shrink-0 text-right text-caption tabular-nums",
											scoreText((q.points / q.max_points) * 100, 100)
										)}
									>
										{q.points}/{q.max_points}
									</span>
								</>
							}
						>
							<div className="flex flex-col gap-1 pl-5">
								<CheckList checks={q.checks} />
								<div className="mt-1 flex flex-wrap items-center gap-1">
									{assistant && (
										<Button size="push" variant="assistant" onClick={() => setCoached(q.id)}>
											<AssistantIcon /> Review with the assistant
										</Button>
									)}
									<ReviewSolution questionId={q.id} />
								</div>
							</div>
						</Disclosure>
					))}
				</Card>
			</section>

			<Sheet open={coached !== null} onOpenChange={o => !o && setCoached(null)}>
				<SheetContent
					closeButton={false}
					className="w-[min(480px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none"
				>
					{/* For screen readers; the pane shows the conversation's title */}
					<SheetHeader className="sr-only">
						<SheetTitle>Review with the assistant</SheetTitle>
						<SheetDescription>{coachedQuestion?.title}</SheetDescription>
					</SheetHeader>
					{coachedQuestion && coachedResult && (
						<AssistantPane
							question={coachedQuestion}
							review={{ checks: coachedResult.checks }}
							onClose={() => setCoached(null)}
							onOpenQuestion={setCoached}
						/>
					)}
				</SheetContent>
			</Sheet>
		</div>
	);
}

/** A question's mark: all its points, some, or none */
function Mark({ points, max }: { points: number; max: number }) {
	if (points === max) return <CircleCheck className="size-4 shrink-0 text-success" />;
	if (points > 0) return <CircleDashed className="size-4 shrink-0 text-warning" />;
	return <Circle className="size-4 shrink-0 text-muted-foreground" />;
}

/** What the attempt did to the prediction for the certification aimed at:
 * before → after, or the first one; nothing while too little is measured */
function PredictionLine({
	certification,
	before,
	after,
	pass,
}: {
	certification: string;
	before: number | null;
	after: number | null;
	pass: number;
}) {
	if (after === null) return null;
	const shown = (n: number) => (
		<span className={cn("font-semibold tabular-nums", scoreText(n, pass))}>{Math.round(n)}%</span>
	);
	return (
		<div className="text-sm">
			<span className="text-muted-foreground">{certName(certification)} predicted </span>
			{before === null ? (
				shown(after)
			) : (
				<>
					{shown(before)} → {shown(after)}
				</>
			)}
			<span className="text-muted-foreground"> · pass at {pass}%</span>
		</div>
	);
}

/** The reference answer under a reviewed question, shown and hidden again */
function ReviewSolution({ questionId }: { questionId: string }) {
	const { solution, shown, label, toggle } = useSolution(questionId);
	return (
		<>
			<Button size="push" variant="ghost" aria-expanded={shown} onClick={toggle}>
				{label}
			</Button>
			{solution && (
				<div className="mt-1 flex w-full flex-col gap-2">
					<Separator />
					<Markdown>{solution.explain}</Markdown>
					<CopyBlock text={solution.run.replace(/\n$/, "")} lang="shell" />
				</div>
			)}
		</>
	);
}
