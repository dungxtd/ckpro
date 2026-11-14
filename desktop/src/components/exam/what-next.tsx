import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { SectionTitle } from "@ckpro/ui/components/section-title";
import { cn } from "@ckpro/ui/lib/utils";
import { ArrowRight, CalendarPlus, ListChecks, Timer } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { FREE_DAY_WITHIN, freeDay, suggestion } from "@/components/study/data";
import { addDays, dayKey } from "@/days";
import { useCatalog, useExam } from "@/stores/exam";
import { useAssistantEnabled, useTargets } from "@/stores/settings";
import { usePlans, useStudy } from "@/stores/study";
import type { Attempt, ExamResult, Mode } from "@/tauri/api";
import { errorText, examApi } from "@/tauri/api";
import type { QuestionResult } from "@/tauri/bindings";
import { shortTitle } from "@/titles";
import { toastUndo } from "@/toast";
import { plural, shortDay } from "@/words";

/** No rest days (no exam aimed at): one array, the same on every render */
const NO_REST: number[] = [];

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
export function WhatNext({
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
	const catalog = useCatalog();
	const history = useStudy(s => s.history);
	// The rest days of the exam this attempt prepares for (or the first aimed at)
	const targets = useTargets();
	const rest =
		(targets.find(t => t.certification === attempt.certification) ?? targets[0])?.rest_days ??
		NO_REST;
	const assistant = useAssistantEnabled();
	const [closing, setClosing] = useState<Step | null>(null);

	// The first day from tomorrow kept for study and free of plans: found
	// again as the plans change (one planned here takes its day)
	const from = addDays(new Date(), 1);
	const { plans } = usePlans(dayKey(from), dayKey(addDays(from, FREE_DAY_WITHIN)));
	const day = plans && freeDay(from, rest, new Set(plans.map(p => p.day)));

	const next = suggestion(
		catalog.filter(e => e.id !== attempt.exam_id),
		history ?? [],
		attempt.certification
	);
	const dayName = day && shortDay(day);
	const plan = async (examId: string, mode: Mode, title: string) => {
		if (!day) return;
		try {
			const id = await examApi.planAdd(dayKey(day), examId, mode);
			toastUndo(`Planned ${shortTitle(title)}, ${dayName}`, () => examApi.planRemove(id));
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
							<div className="text-muted-foreground text-caption">{step.why}</div>
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
				cancel="Keep reviewing"
				onConfirm={() => closing?.run()}
			/>
		</section>
	);
}
