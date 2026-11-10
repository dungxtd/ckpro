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
import {
	ArrowRight,
	CalendarPlus,
	Circle,
	CircleCheck,
	CircleDashed,
	ListChecks,
	ShieldAlert,
	Timer,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { AssistantPane } from "@/components/assistant/assistant-pane";
import { CheckList } from "@/components/exam/check-list";
import { useSolution } from "@/components/exam/use-solution";
import { freeDay, scoreColor, suggestion } from "@/components/study/data";
import { CopyBlock } from "@/components/text/copy-text";
import { Markdown } from "@/components/text/markdown";
import { addDays, dayKey } from "@/days";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled, useSettings } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import type { Attempt, ExamResult, Mode } from "@/tauri/api";
import { errorText, examApi } from "@/tauri/api";
import type { QuestionResult } from "@/tauri/bindings";
import { shortTitle } from "@/titles";
import { plural } from "@/words";

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
	const minutes = Math.round(((result.finished_at ?? 0) - (result.started_at ?? 0)) / 60000);
	const pass = attempt.pass_score;
	const score = result.score ?? 0;
	const color = scoreColor(score, pass);
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
							{/* One colour for the score, from red to green by the pass line */}
							<span
								className="font-semibold text-4xl tabular-nums tracking-tight"
								style={{ color }}
							>
								{score}%
							</span>
							<Badge
								style={{ color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
							>
								{result.passed ? "Passed" : "Below the pass line"}
							</Badge>
						</div>
					</div>
					<ConfirmDialog
						title="Close this exam?"
						description="Its clusters, task host files and desktop are deleted. The result stays in History."
						action="Close Exam"
						cancel="Keep Reviewing"
						onConfirm={end}
					>
						<Button size="push" variant="push">
							Close exam
						</Button>
					</ConfirmDialog>
				</div>
				<Progress value={score} marker={pass} color={color} label="Score" />
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
										className="w-10 shrink-0 text-right text-xs tabular-nums"
										style={{ color: scoreColor((q.points / q.max_points) * 100, 100) }}
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
										<Button
											size="push"
											variant="ghost"
											className="text-highlight"
											onClick={() => setCoached(q.id)}
										>
											<AssistantIcon className="text-assistant" /> Review with the assistant
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
				<SheetContent className="w-[min(480px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-none">
					{/* For screen readers; the pane shows the session's title */}
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
		<span className="font-semibold tabular-nums" style={{ color: scoreColor(n, pass) }}>
			{Math.round(n)}%
		</span>
	);
	return (
		<div className="text-sm">
			<span className="text-muted-foreground">{certification.toUpperCase()} predicted </span>
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

/** One thing to do next: why, and the action that does it */
interface Step {
	icon: ReactNode;
	title: string;
	why: string;
	action: string;
	run: () => void;
	/** Needs the assistant (shown only when it is on) */
	ai?: boolean;
	/** Closes this exam first (its clusters go): asked before */
	closes?: boolean;
}

/**
 * What to do next, from what the app knows: the questions missed, a day kept
 * for study, the exam to take next, the same one in exam mode; Create when
 * the assistant is on. Starting another closes this one, asked first
 */
function WhatNext({
	attempt,
	result,
	missed,
	onShowMissed,
}: {
	attempt: Attempt;
	result: ExamResult;
	missed: QuestionResult[];
	onShowMissed: () => void;
}) {
	const navigate = useNavigate();
	const end = useExam(s => s.end);
	const start = useExam(s => s.start);
	const catalog = useExam(s => s.catalog);
	const loadCatalog = useExam(s => s.loadCatalog);
	const history = useStudy(s => s.history);
	const rest = useSettings(s => s.settings.target?.rest_days ?? []);
	const assistant = useAssistantEnabled();
	const [day, setDay] = useState<Date | null>(null);
	const [closing, setClosing] = useState<Step | null>(null);

	useEffect(() => {
		if (catalog.length === 0) loadCatalog();
	}, [catalog.length, loadCatalog]);
	// The first day from tomorrow kept for study and free of plans
	useEffect(() => {
		const from = addDays(new Date(), 1);
		examApi.plans(dayKey(from), dayKey(addDays(from, 14))).then(
			plans => setDay(freeDay(from, rest, new Set(plans.map(p => p.day)))),
			() => setDay(null)
		);
	}, [rest]);

	const next = suggestion(
		catalog.filter(e => e.id !== attempt.exam_id),
		history ?? [],
		attempt.certification
	);
	const dayName = day?.toLocaleDateString(undefined, {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
	const plan = async (examId: string, mode: Mode, title: string) => {
		if (!day) return;
		try {
			const id = await examApi.planAdd(dayKey(day), examId, mode);
			toast.success(`Planned ${shortTitle(title)}, ${dayName}`, {
				action: { label: "Undo", onClick: () => examApi.planRemove(id) },
			});
		} catch (e) {
			toast.error(errorText(e));
		}
	};
	const startAfter = (examId: string, mode: Mode) => async () => {
		if (await end()) await start(examId, mode);
	};

	const steps: (Step | false | null | undefined)[] = result.passed
		? [
				attempt.mode === "practice" && {
					icon: <Timer />,
					title: "Take it as an exam",
					why: "Timed, no hints or assistant: as on the day",
					action: "Start exam",
					run: startAfter(attempt.exam_id, "exam"),
					closes: true,
				},
				next && {
					icon: <ArrowRight />,
					title: `Next: ${shortTitle(next.exam.title)}`,
					why: next.reason[0].toUpperCase() + next.reason.slice(1),
					action: "Practice it",
					run: startAfter(next.exam.id, "practice"),
					closes: true,
				},
				next &&
					day && {
						icon: <CalendarPlus />,
						title: `Plan ${shortTitle(next.exam.title)} on ${dayName}`,
						why: "The next day you keep for study, free in the Calendar",
						action: "Plan it",
						run: () => plan(next.exam.id, "practice", next.exam.title),
					},
			]
		: [
				missed.length > 0 && {
					icon: <ListChecks />,
					title: `Go over the ${plural(missed.length, "question")} you missed`,
					why: "Each opens below, with its checks and solution",
					action: "Open them",
					run: onShowMissed,
				},
				day && {
					icon: <CalendarPlus />,
					title: `Plan a retake on ${dayName}`,
					why: "The next day you keep for study, free in the Calendar",
					action: "Plan it",
					run: () => plan(attempt.exam_id, attempt.mode, attempt.title),
				},
				next && {
					icon: <ArrowRight />,
					title: `Next: ${shortTitle(next.exam.title)}`,
					why: next.reason[0].toUpperCase() + next.reason.slice(1),
					action: "Practice it",
					run: startAfter(next.exam.id, "practice"),
					closes: true,
				},
				assistant &&
					missed.length > 0 && {
						icon: <AssistantIcon className="text-assistant" />,
						title: "Build an exam of what you missed",
						why: "Create picks and writes questions like these",
						action: "Open Create",
						ai: true,
						closes: true,
						run: async () => {
							await end();
							const ask = `A practice exam with new questions like these I missed in ${attempt.title}: ${missed.map(q => q.title).join(", ")}.`;
							navigate(`/create?ask=${encodeURIComponent(ask)}`);
						},
					},
			];
	const shown = steps.filter((s): s is Step => !!s);
	if (shown.length === 0) return null;

	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>What next</SectionTitle>
			<Card padding="none" className="overflow-hidden">
				{shown.map(step => (
					<div
						key={step.title}
						className="flex items-center gap-3 border-border px-4 py-2.5 not-first:border-t"
					>
						<span
							className={cn(
								"grid size-7 shrink-0 place-items-center rounded-lg bg-accent [&_svg]:size-3.5",
								step.ai && "bg-assistant/15"
							)}
						>
							{step.icon}
						</span>
						<div className="min-w-0 flex-1">
							<div className="text-sm">{step.title}</div>
							<div className="text-muted-foreground text-xs">{step.why}</div>
						</div>
						<Button
							size="push"
							variant="push"
							onClick={() => (step.closes ? setClosing(step) : step.run())}
						>
							{step.action}
						</Button>
					</div>
				))}
			</Card>
			<ConfirmDialog
				open={closing !== null}
				onOpenChange={o => !o && setClosing(null)}
				title="Close this exam first?"
				description="Its clusters, task host files and desktop are deleted. The result stays in History."
				action={closing?.action ?? "Continue"}
				cancel="Keep Reviewing"
				onConfirm={() => closing?.run()}
			/>
		</section>
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
