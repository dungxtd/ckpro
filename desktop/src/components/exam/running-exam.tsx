import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { useRef, useState } from "react";
import { useExam } from "@/stores/exam";
import type { Attempt } from "@/tauri/api";
import { DesktopView } from "./desktop-view";
import { QuestionPanel } from "./question-panel";
import { Timer } from "./timer";

/**
 * The exam desk, laid out like the exam's ExamUI: navigation and time on
 * top, the task on the left (drag the border to resize), the remote desktop
 * on the right.
 */
export function RunningExam({
	attempt,
	startedAt,
	endsAt,
}: {
	attempt: Attempt;
	startedAt: number;
	endsAt: number | null;
}) {
	const { current, flagged, select, toggleFlag, submit, end } = useExam();
	const [confirming, setConfirming] = useState(false);
	const [width, setWidth] = useState(34);
	const desk = useRef<HTMLDivElement>(null);
	const question = attempt.questions[current];
	const count = attempt.questions.length;

	const drag = (event: React.PointerEvent) => {
		const area = desk.current?.getBoundingClientRect();
		if (!area) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		const move = (e: PointerEvent) =>
			setWidth(Math.min(70, Math.max(20, ((e.clientX - area.left) / area.width) * 100)));
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	return (
		<div className="flex h-full flex-col">
			<header className="flex items-center gap-2 border-border border-b px-3 py-1.5">
				<strong className="truncate">{attempt.title}</strong>
				<Badge variant={attempt.mode === "exam" ? "solid" : "subtle"}>
					{attempt.mode === "exam" ? "Exam" : "Practice"}
				</Badge>
				<div className="mx-auto flex items-center gap-1">
					<Button
						size="sm"
						variant="ghost"
						disabled={current === 0}
						onClick={() => select(current - 1)}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<select
						className="rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
						value={current}
						onChange={e => select(Number(e.target.value))}
						aria-label="Question"
					>
						{attempt.questions.map((q, i) => (
							<option key={q.id} value={i}>
								Question {i + 1} of {count}
								{flagged.includes(q.id) ? " ⚑" : ""}
							</option>
						))}
					</select>
					<Button
						size="sm"
						variant="ghost"
						disabled={current === count - 1}
						onClick={() => select(current + 1)}
					>
						<ChevronRight className="size-4" />
					</Button>
					{question && (
						<Button
							size="sm"
							variant={flagged.includes(question.id) ? "default" : "outline"}
							onClick={() => toggleFlag(question.id)}
						>
							<Flag className="size-4" /> Flag
						</Button>
					)}
				</div>
				<span className="text-sm">
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
							End exam
						</Button>
						{attempt.mode === "practice" && (
							<Button size="sm" variant="ghost" onClick={end}>
								Quit
							</Button>
						)}
					</>
				)}
			</header>
			<div ref={desk} className="flex min-h-0 flex-1">
				<section className="shrink-0 overflow-auto p-4" style={{ width: `${width}%` }}>
					{question && <QuestionPanel attempt={attempt} question={question} index={current} />}
				</section>
				<div
					onPointerDown={drag}
					className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40"
					title="Drag to resize"
				/>
				<section className="min-w-0 flex-1">
					{/* A new attempt is a new desktop */}
					<DesktopView key={attempt.id} />
				</section>
			</div>
		</div>
	);
}
