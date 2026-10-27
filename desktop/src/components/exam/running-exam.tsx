import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ckdry/ui/components/alert-dialog";
import { Badge } from "@ckdry/ui/components/badge";
import { Button, buttonVariants } from "@ckdry/ui/components/button";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckdry/ui/components/select";
import { Stepper } from "@ckdry/ui/components/stepper";
import { cn } from "@ckdry/ui/lib/utils";
import { BookOpen, ChevronLeft, ChevronRight, Flag, Monitor, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import type { Attempt } from "@/tauri/api";
import { AssistantPane } from "./assistant-pane";
import { DesktopView } from "./desktop-view";
import { ExamSettings } from "./exam-settings";
import { QuestionPanel, TextSize } from "./question-panel";
import { ReadMe } from "./readme";
import { Timer } from "./timer";

/** The ExamUI's +/-: how much larger the desktop is drawn */
const ZOOMS = [1, 1.25, 1.5, 1.75, 2];

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
	const zoom = ZOOMS.includes(settings.desktop_zoom ?? 1) ? (settings.desktop_zoom ?? 1) : 1;
	const resolution = settings.desktop_resolution ?? null;
	const changeZoom = (step: number) => {
		const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom) + step))] ?? 1;
		update({ desktop_zoom: next });
	};
	const changeResolution = (next: [number, number] | null) => update({ desktop_resolution: next });
	const [tab, setTab] = useState<"desktop" | "readme">("desktop");
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
			{/* Labels give way to icons as the window narrows (container queries) */}
			<header className="@container flex select-none items-center gap-3 border-border border-b px-3 py-2">
				<div className="shrink-0">
					<Timer startedAt={startedAt} endsAt={endsAt} />
				</div>
				<strong className="min-w-0 flex-1 truncate text-base">{attempt.title}</strong>
				{attempt.mode === "practice" && (
					<Badge variant="subtle" className="hidden shrink-0 @2xl:inline-flex">
						Practice
					</Badge>
				)}
				<div className="flex shrink-0 items-center gap-2">
					<Stepper
						label="Desktop size"
						value={`${Math.round(zoom * 100)}%`}
						onDecrement={() => changeZoom(-1)}
						onIncrement={() => changeZoom(1)}
						decrementDisabled={zoom === ZOOMS[0]}
						incrementDisabled={zoom === ZOOMS[ZOOMS.length - 1]}
					/>
					<SegmentedControl
						label="View"
						value={tab}
						onChange={setTab}
						options={[
							{ value: "desktop", label: <TabLabel icon={Monitor} text="Desktop" /> },
							{ value: "readme", label: <TabLabel icon={BookOpen} text="Readme" /> },
						]}
					/>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								size="push"
								variant="outline"
								className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								<X /> <span className="sr-only @2xl:not-sr-only">End Exam</span>
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>End the exam?</AlertDialogTitle>
								<AlertDialogDescription>
									Your work is graded now and the exam environment is removed. You cannot come back
									to it.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Keep working</AlertDialogCancel>
								<AlertDialogAction
									className={buttonVariants({ variant: "destructive" })}
									onClick={submit}
								>
									End exam
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					{attempt.mode === "practice" && (
						<Button size="push" variant="ghost" onClick={end}>
							Quit
						</Button>
					)}
					{attempt.mode === "practice" && (
						<Button
							size="push"
							variant={assistantOpen ? "pushDefault" : "push"}
							aria-pressed={assistantOpen}
							onClick={() => setAssistantOpen(!assistantOpen)}
						>
							<Sparkles /> <span className="sr-only @3xl:not-sr-only">Assistant</span>
						</Button>
					)}
					<ExamSettings resolution={resolution} onResolution={changeResolution} />
				</div>
			</header>
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
									<SelectValue />
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
					{question && (
						<div className="flex gap-2 border-border border-t p-3">
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
						<DesktopView key={attempt.id} zoom={zoom} resolution={resolution} />
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
					<div className="shrink-0" style={{ width: assistantWidth }}>
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
	"w-1.5 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-highlight/60";

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

/** A tab's icon, with its name once the header has room (always for screen readers) */
function TabLabel({ icon: Icon, text }: { icon: typeof Monitor; text: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<Icon className="size-3.5" />
			<span className="sr-only @4xl:not-sr-only">{text}</span>
		</span>
	);
}
