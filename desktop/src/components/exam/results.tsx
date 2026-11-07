import { Alert } from "@cktry/ui/components/alert";
import { Badge } from "@cktry/ui/components/badge";
import { Button } from "@cktry/ui/components/button";
import { Card } from "@cktry/ui/components/card";
import { ConfirmDialog } from "@cktry/ui/components/confirm-dialog";
import { Separator } from "@cktry/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@cktry/ui/components/sheet";
import { cn } from "@cktry/ui/lib/utils";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { AssistantPane } from "@/components/assistant/assistant-pane";
import { CheckList } from "@/components/exam/check-list";
import { useSolution } from "@/components/exam/use-solution";
import { CopyBlock } from "@/components/text/copy-text";
import { Markdown } from "@/components/text/markdown";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled } from "@/stores/settings";
import type { Attempt, ExamResult } from "@/tauri/api";

/** The result like the exam gives it (score, pass/fail), then the review. */
export function Results({ attempt, result }: { attempt: Attempt; result: ExamResult }) {
	const end = useExam(s => s.end);
	const [review, setReview] = useState(false);
	// The question reviewed with the coach, in a side sheet
	const [coached, setCoached] = useState<string | null>(null);
	const assistant = useAssistantEnabled();
	const coachedResult = result.questions.find(q => q.id === coached);
	const coachedQuestion = attempt.questions.find(q => q.id === coached);
	const minutes = Math.round(((result.finished_at ?? 0) - (result.started_at ?? 0)) / 60000);

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
			<Card padding="lg" className="text-center">
				<div className="text-muted-foreground text-sm">{attempt.title}</div>
				<div
					className={cn(
						"my-2 font-bold text-5xl",
						result.passed ? "text-success" : "text-destructive"
					)}
				>
					{result.score}%
				</div>
				<div className="font-semibold">{result.passed ? "PASS" : "FAIL"}</div>
				<div className="text-muted-foreground text-sm">
					Passing score {attempt.pass_score}% · {minutes} min
				</div>
				{result.outside.length > 0 && (
					<Alert variant="warning" className="mt-4 text-left">
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
				<div className="mt-4 flex justify-center gap-2">
					{!review && <Button onClick={() => setReview(true)}>Review answers</Button>}
					<ConfirmDialog
						title="Close this exam?"
						description="Its clusters, task host files and desktop are deleted. The result stays in History."
						action="Close Exam"
						cancel="Keep Reviewing"
						onConfirm={end}
					>
						<Button variant="outline">Close exam (deletes its clusters)</Button>
					</ConfirmDialog>
				</div>
			</Card>

			{review &&
				result.questions.map((q, i) => {
					return (
						<Card key={q.id}>
							<header className="mb-2 flex items-baseline gap-2">
								<strong>
									{i + 1}. {q.title}
								</strong>
								{/* Claude ran commands for it (Agent): the points were helped */}
								{result.assisted?.includes(q.id) && (
									<Badge variant="subtle" className="shrink-0 gap-1">
										<AssistantIcon className="size-3 text-claude" /> Claude helped
									</Badge>
								)}
								<span
									className={cn(
										"ml-auto text-sm tabular-nums",
										q.points === q.max_points ? "text-success" : "text-destructive"
									)}
								>
									{q.points}/{q.max_points}
								</span>
							</header>
							<CheckList checks={q.checks} />
							{assistant && (
								<Button
									size="push"
									variant="ghost"
									className="mt-2 text-highlight"
									onClick={() => setCoached(q.id)}
								>
									<AssistantIcon className="text-claude" /> Review with Claude
								</Button>
							)}
							<ReviewSolution questionId={q.id} />
						</Card>
					);
				})}

			<Sheet open={coached !== null} onOpenChange={open => !open && setCoached(null)}>
				<SheetContent className="w-[min(480px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none">
					{/* For screen readers; the pane shows the session's title */}
					<SheetHeader className="sr-only">
						<SheetTitle>Review with Claude</SheetTitle>
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

/** The reference answer under a reviewed question, shown and hidden again */
function ReviewSolution({ questionId }: { questionId: string }) {
	const { solution, shown, label, toggle } = useSolution(questionId);
	return (
		<>
			<Button size="sm" variant="ghost" className="mt-2" aria-expanded={shown} onClick={toggle}>
				{label}
			</Button>
			{solution && (
				<div className="mt-1 flex flex-col gap-2">
					<Separator />
					<Markdown>{solution.explain}</Markdown>
					<CopyBlock text={solution.run.replace(/\n$/, "")} lang="shell" />
				</div>
			)}
		</>
	);
}
