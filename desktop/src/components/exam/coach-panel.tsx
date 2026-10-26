import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Chip } from "@ckdry/ui/components/chip";
import { Spinner } from "@ckdry/ui/components/spinner";
import { cn } from "@ckdry/ui/lib/utils";
import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import { type CheckResult, type CoachStatus, coachApi, type QuestionView } from "@/tauri/api";

/** One-click questions; the coach gets the task and the last check either way */
const ACTIONS = [
	{ label: "Hint", text: "Give me a hint for this task, without the solution." },
	{ label: "Explain", text: "Explain briefly the concept this task is about." },
	{
		label: "Docs & search",
		text: "Which documentation pages help with this task, and what should I type in the kubernetes.io search box to find them?",
	},
];
const WHY = "Why do my checks fail? Point me to the cause, not the full solution.";

/** After the result: the exam is over, the coach explains fully */
const REVIEW_ACTIONS = [
	{
		label: "What went wrong?",
		text: "What went wrong in this task? Go through the failing checks.",
	},
	{ label: "Fastest solution", text: "Show me the fastest way to solve this task on the exam." },
	{
		label: "Docs & search",
		text: "Where is this in the documentation, and what should I type in the kubernetes.io search box?",
	},
];

/**
 * The practice coach for the current question: ask in your own words or with
 * a quick action. Code in answers copies to the desktop, links open in its
 * Firefox, like the question's.
 */
export function CoachPanel({
	question,
	review,
}: {
	question: QuestionView;
	/** The attempt's result for the question: reviewing it, no longer practising */
	review?: { checks: CheckResult[] };
}) {
	const { threads, writing, error, load, ask, stop } = useCoach();
	const lastCheck = useExam(s => s.checks[question.id]);
	const checks = review?.checks ?? (Array.isArray(lastCheck) ? lastCheck : undefined);
	const failing = !review && !!checks?.some(c => !c.passed);
	const thread = threads[question.id] ?? [];
	const busy = writing !== null;
	const [status, setStatus] = useState<CoachStatus | null>(null);
	const [draft, setDraft] = useState("");
	const scroller = useRef<HTMLDivElement>(null);

	useEffect(() => {
		coachApi.status().then(setStatus);
	}, []);
	useEffect(() => {
		load(question.id);
	}, [load, question.id]);
	// Follow the answer as it is written, unless the reader scrolled up
	const written = thread.reduce((n, m) => n + m.text.length + 1, 0);
	useEffect(() => {
		const el = scroller.current;
		if (el && written > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 120)
			el.scrollTop = el.scrollHeight;
	}, [written]);

	const send = (text: string) => {
		const t = text.trim();
		if (!t || busy) return;
		setDraft("");
		ask(question.id, t, review?.checks);
	};

	if (status && !status.claude) {
		return (
			<Alert variant="warning" className="flex-col">
				<strong>The coach needs Claude Code</strong>
				<p>
					Install it from claude.ai/code and sign in once (<code>claude</code> in a terminal).
					Answers then use your Claude plan.
				</p>
			</Alert>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col select-text">
			<div ref={scroller} className="min-h-0 flex-1 overflow-auto px-4 py-3">
				{thread.length === 0 ? (
					<div className="flex flex-col gap-2 py-6 text-center text-muted-foreground text-sm">
						<p>
							{review
								? "Review this task with the coach."
								: "Stuck? Ask about this task, or pick a question below."}
						</p>
						<p className="text-xs">
							{review
								? "The exam is over: the coach sees the task, your result and the solution."
								: "The coach sees the task and your last check, not the solution."}
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{thread.map((m, i) =>
							m.role === "user" ? (
								<div
									// Messages only grow at the end
									// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
									key={i}
									className="ml-8 self-end rounded-xl bg-muted px-3 py-2 text-sm"
								>
									{m.text}
								</div>
							) : (
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
								<div key={i} className="min-w-0">
									{m.text ? (
										<Markdown copy>{m.text}</Markdown>
									) : (
										<span className="flex items-center gap-2 text-muted-foreground text-sm">
											<Spinner size="inline" /> Looking at the task…
										</span>
									)}
								</div>
							)
						)}
					</div>
				)}
				{error && (
					<Alert variant="destructive" className="mt-3">
						{error}
					</Alert>
				)}
			</div>

			<div className="flex flex-col gap-2 border-border border-t p-3">
				<div className="flex flex-wrap gap-1.5">
					{failing && (
						<Chip className="text-highlight" onClick={() => send(WHY)}>
							Why do my checks fail?
						</Chip>
					)}
					{(review ? REVIEW_ACTIONS : ACTIONS).map(a => (
						<Chip key={a.label} onClick={() => send(a.text)}>
							{a.label}
						</Chip>
					))}
				</div>
				<div className="flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring">
					<textarea
						value={draft}
						onChange={e => setDraft(e.target.value)}
						onKeyDown={e => {
							if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
								e.preventDefault();
								send(draft);
							}
						}}
						rows={1}
						placeholder="Ask the coach…"
						aria-label="Ask the coach"
						className="field-sizing-content max-h-32 min-h-7 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none"
					/>
					{busy ? (
						<Button size="push" variant="push" aria-label="Stop" onClick={stop}>
							<Square />
						</Button>
					) : (
						<Button
							size="push"
							variant="pushDefault"
							aria-label="Send"
							disabled={!draft.trim()}
							onClick={() => send(draft)}
						>
							<ArrowUp />
						</Button>
					)}
				</div>
				<p className={cn("text-muted-foreground text-xs")}>
					Answers by Claude Code with your Claude plan. Not available in exam mode, as on the real
					exam.
				</p>
			</div>
		</div>
	);
}
