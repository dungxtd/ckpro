import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { cn } from "@ckdry/ui/lib/utils";
import { Flag } from "lucide-react";
import { useState } from "react";
import { TerminalView } from "@/components/terminal/terminal-view";
import { useExam } from "@/stores/exam";
import type { Attempt } from "@/tauri/api";
import { QuestionPanel } from "./question-panel";
import { Timer } from "./timer";

/** The exam desk: questions on the left, the jumphost on the right. */
export function RunningExam({
	attempt,
	startedAt,
	endsAt,
}: {
	attempt: Attempt;
	startedAt: number;
	endsAt: number | null;
}) {
	const { current, flagged, select, submit, end } = useExam();
	const [confirming, setConfirming] = useState(false);
	const question = attempt.questions[current];

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-3 border-border border-b px-3 py-2">
				<strong className="truncate">{attempt.title}</strong>
				<Badge variant={attempt.mode === "exam" ? "solid" : "subtle"}>
					{attempt.mode === "exam" ? "Exam" : "Practice"}
				</Badge>
				<span className="ml-auto text-sm">
					<Timer startedAt={startedAt} endsAt={endsAt} />
				</span>
				{confirming ? (
					<>
						<span className="text-sm">Submit and grade now?</span>
						<Button size="sm" onClick={submit}>
							Submit
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
							Keep working
						</Button>
					</>
				) : (
					<>
						<Button size="sm" onClick={() => setConfirming(true)}>
							Submit exam
						</Button>
						{attempt.mode === "practice" && (
							<Button size="sm" variant="ghost" onClick={end}>
								Quit
							</Button>
						)}
					</>
				)}
			</header>
			<div className="flex min-h-0 flex-1">
				<nav className="flex w-14 shrink-0 flex-col gap-1 overflow-auto border-border border-r p-2">
					{attempt.questions.map((q, i) => (
						<button
							type="button"
							key={q.id}
							onClick={() => select(i)}
							className={cn(
								"relative rounded-md py-1.5 text-sm tabular-nums hover:bg-accent",
								i === current && "bg-accent font-semibold"
							)}
						>
							{i + 1}
							{flagged.includes(q.id) && (
								<Flag className="absolute top-0.5 right-0.5 size-2.5 text-amber-500" />
							)}
						</button>
					))}
				</nav>
				<section className="w-[42%] shrink-0 overflow-auto p-4">
					{question && <QuestionPanel attempt={attempt} question={question} index={current} />}
				</section>
				<section className="min-w-0 flex-1 border-border border-l p-2">
					{/* One shell for the whole attempt, on the jumphost */}
					<TerminalView container={null} session={Number(attempt.id)} />
				</section>
			</div>
		</div>
	);
}
