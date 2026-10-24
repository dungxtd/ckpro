import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { cn } from "@ckdry/ui/lib/utils";
import { BookOpen, ChevronLeft, ChevronRight, Flag, Minus, Monitor, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import type { Attempt } from "@/tauri/api";
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
	const [confirming, setConfirming] = useState(false);
	const [width, setWidth] = useState(34);
	// Desktop zoom and resolution live in the app database
	const { settings, update } = useSettings();
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
			{/* Labels give way to icons as the window narrows (container queries) */}
			<header className="@container flex items-center gap-3 border-border border-b px-3 py-2">
				<div className="shrink-0">
					<Timer startedAt={startedAt} endsAt={endsAt} />
				</div>
				<strong className="min-w-0 flex-1 truncate text-base">{attempt.title}</strong>
				{attempt.mode === "practice" && (
					<Badge variant="subtle" className="hidden shrink-0 @2xl:inline-flex">
						Practice
					</Badge>
				)}
				<div className="flex shrink-0 items-center gap-1.5">
					<div className="flex items-center" title="Desktop size">
						<Button
							size="sm"
							variant="ghost"
							disabled={zoom === ZOOMS[0]}
							onClick={() => changeZoom(-1)}
						>
							<Minus className="size-4" />
						</Button>
						<span className="hidden w-10 text-center text-muted-foreground text-xs tabular-nums @3xl:inline">
							{Math.round(zoom * 100)}%
						</span>
						<Button
							size="sm"
							variant="ghost"
							disabled={zoom === ZOOMS[ZOOMS.length - 1]}
							onClick={() => changeZoom(1)}
						>
							<Plus className="size-4" />
						</Button>
					</div>
					<Button
						size="sm"
						variant={tab === "desktop" ? "outline" : "ghost"}
						onClick={() => setTab("desktop")}
					>
						<Monitor className="size-4" /> <span className="hidden @4xl:inline">Desktop</span>
					</Button>
					<Button
						size="sm"
						variant={tab === "readme" ? "outline" : "ghost"}
						onClick={() => setTab("readme")}
					>
						<BookOpen className="size-4" /> <span className="hidden @4xl:inline">Readme</span>
					</Button>
					{confirming ? (
						<>
							<span className="hidden text-sm @5xl:inline">End the exam and grade it?</span>
							<Button size="sm" variant="destructive" onClick={submit}>
								End exam
							</Button>
							<Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
								Keep working
							</Button>
						</>
					) : (
						<Button
							size="sm"
							variant="outline"
							className="border-red-500/60 text-red-500 hover:bg-red-500/10"
							onClick={() => setConfirming(true)}
						>
							<X className="size-4" /> <span className="hidden @2xl:inline">End Exam</span>
						</Button>
					)}
					{attempt.mode === "practice" && (
						<Button size="sm" variant="ghost" onClick={end}>
							Quit
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
					<div className="flex items-center gap-2 p-3">
						<Button
							size="sm"
							variant="outline"
							disabled={current === 0}
							onClick={() => select(current - 1)}
							aria-label="Previous question"
						>
							<ChevronLeft className="size-4" />
						</Button>
						<select
							className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-center text-sm tabular-nums"
							value={current}
							onChange={e => select(Number(e.target.value))}
							aria-label="Question"
						>
							{attempt.questions.map((q, i) => (
								<option key={q.id} value={i}>
									Question {i + 1} of {count}
									{flagged.includes(q.id) ? "  ⚑ flagged" : ""}
								</option>
							))}
						</select>
						<Button
							size="sm"
							variant="outline"
							disabled={current === count - 1}
							onClick={() => select(current + 1)}
							aria-label="Next question"
						>
							<ChevronRight className="size-4" />
						</Button>
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
					onPointerDown={drag}
					className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40"
					title="Drag to resize"
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
			</div>
		</div>
	);
}
