import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { CodeBlock } from "@ckdry/ui/components/code-block";
import { Separator } from "@ckdry/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@ckdry/ui/components/sheet";
import { cn } from "@ckdry/ui/lib/utils";
import { ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { useExam } from "@/stores/exam";
import type { Attempt, ExamResult } from "@/tauri/api";
import { AssistantPane } from "./assistant-pane";
import { CheckList } from "./check-list";
import { useSolution } from "./use-solution";

/** The result like the exam gives it (score, pass/fail), then the review. */
export function Results({ attempt, result }: { attempt: Attempt; result: ExamResult }) {
	const { end } = useExam();
	const [review, setReview] = useState(false);
	// The question reviewed with the coach, in a side sheet
	const [coached, setCoached] = useState<string | null>(null);
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
					<Button variant="outline" onClick={end}>
						Close exam (deletes its clusters)
					</Button>
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
							<Button
								size="push"
								variant="ghost"
								className="mt-2 text-highlight"
								onClick={() => setCoached(q.id)}
							>
								<Sparkles /> Review with AI
							</Button>
							<ReviewSolution questionId={q.id} />
						</Card>
					);
				})}

			<Sheet open={coached !== null} onOpenChange={open => !open && setCoached(null)}>
				<SheetContent className="w-[min(480px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none">
					{/* For screen readers; the pane shows the session's title */}
					<SheetHeader className="sr-only">
						<SheetTitle>Review with AI</SheetTitle>
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
					<CodeBlock>{solution.run}</CodeBlock>
				</div>
			)}
		</>
	);
}
