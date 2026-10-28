import { Button } from "@ckdry/ui/components/button";
import { IconButton } from "@ckdry/ui/components/icon-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckdry/ui/components/select";
import { cn } from "@ckdry/ui/lib/utils";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import type { Attempt } from "@/tauri/api";
import { AssistantPane } from "./assistant-pane";
import { useDesktopSettings } from "./desktop-menu";
import { DesktopView } from "./desktop-view";
import { PracticeActions, QuestionPanel, TextSize } from "./question-panel";
import { ReadMe } from "./readme";
import { type DeskView, TopBar } from "./top-bar";

/** Like the exam's timer bar: alerts at 30, 15 and 5 minutes left */
const ALERTS_MIN = [30, 15, 5];

function useTimeAlerts(endsAt: number | null) {
	// Alerts already past (the app reopened mid-exam) stay quiet
	const fired = useRef<Set<number> | null>(null);
	useEffect(() => {
		if (endsAt === null) return;
		const left = () => (endsAt - Date.now()) / 60_000;
		fired.current = new Set(ALERTS_MIN.filter(m => left() <= m));
		const timer = setInterval(() => {
			for (const minutes of ALERTS_MIN) {
				if (left() <= minutes && !fired.current?.has(minutes)) {
					fired.current?.add(minutes);
					toast.warning(`${minutes} minutes left`, { duration: 10_000 });
				}
			}
		}, 1000);
		return () => clearInterval(timer);
		// Each attempt has its own end
	}, [endsAt]);
}

/**
 * The exam desk: time and the exam's controls on top, the task on the left
 * (navigation, where to solve it, the text, flag and next; drag the border to
 * resize), the remote desktop (or its Readme) on the right.
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
	// Practice mode: the assistant pane beside the desktop (never in exam mode)
	const setAssistantOpen = useCoach(s => s.setOpen);
	// Desktop zoom and resolution, the panels' sizes and the assistant pane
	// live in the app database: the desk reopens as it was left
	const { settings, update } = useSettings();
	const assistantOpen = settings.assistant_open && attempt.mode === "practice";
	// While a border is dragged; saved when it is let go
	const [dragged, setDragged] = useState<{ task?: number; assistant?: number }>({});
	const width = dragged.task ?? settings.task_width;
	const assistantWidth = dragged.assistant ?? settings.assistant_width;
	const desktop = useDesktopSettings();
	const [tab, setTab] = useState<DeskView>("desktop");
	useTimeAlerts(endsAt);
	const desk = useRef<HTMLDivElement>(null);
	const question = attempt.questions[current];
	const count = attempt.questions.length;

	// The task panel's right border: its share of the desk
	const dragTask = (event: React.PointerEvent) => {
		const area = desk.current?.getBoundingClientRect();
		if (!area) return;
		dragBorder(
			event,
			x => Math.min(70, Math.max(20, ((x - area.left) / area.width) * 100)),
			task => setDragged({ task }),
			task => {
				update({ task_width: task });
				setDragged({});
			}
		);
	};
	// The assistant pane's left border: its width
	const dragAssistant = (event: React.PointerEvent) => {
		const area = desk.current?.getBoundingClientRect();
		if (!area) return;
		dragBorder(
			event,
			x => Math.round(Math.min(720, Math.max(300, area.right - x))),
			assistant => setDragged({ assistant }),
			assistant => {
				update({ assistant_width: assistant });
				setDragged({});
			}
		);
	};

	return (
		<div className="flex h-full flex-col">
			<TopBar
				attempt={attempt}
				startedAt={startedAt}
				endsAt={endsAt}
				view={tab}
				onView={setTab}
				desktop={desktop}
				assistantOpen={assistantOpen}
				onAssistant={setAssistantOpen}
				onFinish={submit}
				onQuit={end}
			/>
			<div ref={desk} className="flex min-h-0 flex-1">
				{/* Nothing to select: the question's values copy on click, as on the exam */}
				<section
					className="@container flex min-w-[300px] max-w-[70%] shrink-0 select-none flex-col"
					style={{ width: `${width}%` }}
				>
					{/* Question navigation together at the start, the text size at the end:
					    nothing stretches when the panel is wide */}
					<div className="flex items-center justify-between gap-2 p-3">
						<div className="flex min-w-0 items-center gap-1">
							<IconButton
								variant="plain"
								size="sm"
								className="size-7"
								disabled={current === 0}
								onClick={() => select(current - 1)}
								aria-label="Previous question"
							>
								<ChevronLeft />
							</IconButton>
							<Select value={String(current)} onValueChange={value => select(Number(value))}>
								<SelectTrigger aria-label="Question" className="min-w-0 tabular-nums">
									{/* Short while the panel is narrow; the list keeps the full names */}
									<SelectValue>
										<span className="@sm:hidden">
											{current + 1} / {count}
										</span>
										<span className="hidden @sm:inline">
											Question {current + 1} of {count}
										</span>
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{attempt.questions.map((q, i) => (
										<SelectItem key={q.id} value={String(i)}>
											Question {i + 1} of {count}
											{flagged.includes(q.id) && (
												<Flag className="text-warning" aria-label="flagged" />
											)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<IconButton
								variant="plain"
								size="sm"
								className="size-7"
								disabled={current === count - 1}
								onClick={() => select(current + 1)}
								aria-label="Next question"
							>
								<ChevronRight />
							</IconButton>
						</div>
						<TextSize />
					</div>
					<div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
						{question && <QuestionPanel attempt={attempt} question={question} />}
					</div>
					{question && attempt.mode === "practice" && (
						<div className="border-border border-t px-3 pt-3">
							<PracticeActions question={question} />
						</div>
					)}
					{question && (
						<div
							className={cn(
								"flex gap-2 p-3",
								attempt.mode !== "practice" && "border-border border-t"
							)}
						>
							<Button
								variant={flagged.includes(question.id) ? "default" : "outline"}
								className="flex-1"
								onClick={() => toggleFlag(question.id)}
							>
								<Flag className="size-4" />
								<span className="hidden @sm:inline">
									{flagged.includes(question.id) ? "Flagged for review" : "Flag for review"}
								</span>
								<span className="@sm:hidden">
									{flagged.includes(question.id) ? "Flagged" : "Flag"}
								</span>
							</Button>
							<Button
								className="flex-1"
								disabled={current === count - 1}
								onClick={() => select(current + 1)}
							>
								<span className="hidden @sm:inline">Satisfied with answer</span>
								<span className="@sm:hidden">Next</span>
								<ChevronRight className="size-4" />
							</Button>
						</div>
					)}
				</section>
				<div
					// A mouse drag handle (the panel keeps its size otherwise)
					aria-hidden="true"
					onPointerDown={dragTask}
					className={RESIZE_HANDLE}
				/>
				<section className="relative min-w-0 flex-1">
					{/* Stays connected behind the Readme; a new attempt is a new desktop */}
					<div className={cn("absolute inset-0", tab !== "desktop" && "invisible")}>
						<DesktopView key={attempt.id} zoom={desktop.zoom} resolution={desktop.resolution} />
					</div>
					{tab === "readme" && (
						<div className="absolute inset-0 bg-background">
							<ReadMe attempt={attempt} />
						</div>
					)}
				</section>
				{assistantOpen && question && (
					<div aria-hidden="true" onPointerDown={dragAssistant} className={RESIZE_HANDLE} />
				)}
				{assistantOpen && question && (
					<div className="max-w-[40%] shrink-0" style={{ width: assistantWidth }}>
						<AssistantPane
							question={question}
							onClose={() => setAssistantOpen(false)}
							onOpenQuestion={id => {
								const i = attempt.questions.findIndex(q => q.id === id);
								if (i >= 0) select(i);
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

/** A border dragged to resize the panels beside it */
const RESIZE_HANDLE =
	"relative z-10 w-px shrink-0 cursor-col-resize bg-border transition-colors before:absolute before:inset-y-0 before:-inset-x-1 before:content-[''] hover:bg-highlight active:bg-highlight";

/**
 * Follow a border drag: `size` turns the pointer's x into the new size,
 * `move` shows it as it goes, `done` keeps the last one when it is let go
 */
function dragBorder(
	event: React.PointerEvent,
	size: (x: number) => number,
	move: (size: number) => void,
	done: (size: number) => void
) {
	event.currentTarget.setPointerCapture(event.pointerId);
	let last: number | null = null;
	const onMove = (e: PointerEvent) => {
		last = size(e.clientX);
		move(last);
	};
	const onUp = () => {
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		if (last !== null) done(last);
	};
	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", onUp);
}
