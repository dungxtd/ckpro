import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { Progress } from "@ckpro/ui/components/progress";
import { Stat, StatGroup } from "@ckpro/ui/components/stat";
import { cn } from "@ckpro/ui/lib/utils";
import { BookOpenCheck, ListChecks, Server, Target, Timer } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled } from "@/stores/settings";
import type { ExamSummary } from "@/tauri/api";
import { gb, memoryFit } from "./exams";

/**
 * One exam, as the Exams screen shows it: what it is, what it asks of the
 * machine, and the two ways to take it. `dockerMb`: Docker's memory when it
 * is up
 */
export function ExamDetail({ exam, dockerMb }: { exam: ExamSummary; dockerMb: number | null }) {
	const start = useExam(s => s.start);
	const assistant = useAssistantEnabled();
	const f = memoryFit(exam, dockerMb);
	const ready = f === "fits" || f === "slower";

	return (
		<div className="flex flex-col gap-7">
			<header className="flex flex-col gap-2">
				<Badge className="self-start">{exam.certification.toUpperCase()}</Badge>
				<h1 className="min-w-0 break-words font-bold text-[26px] leading-tight">{exam.title}</h1>
				<Description text={exam.description} />
			</header>

			<StatGroup>
				<Stat
					icon={<ListChecks />}
					value={exam.questions}
					label={exam.questions === 1 ? "question" : "questions"}
				/>
				<Stat icon={<Timer />} value={`${exam.duration_minutes} min`} label="time" />
				<Stat icon={<Target />} value={`${exam.pass_score}%`} label="to pass" />
				<Stat icon={<Server />} value={exam.nodes} label="nodes" />
			</StatGroup>

			<div className="flex items-center gap-3 text-caption">
				<span>Memory</span>
				{dockerMb !== null && (
					<Progress
						value={Math.min(100, (exam.memory_mb * 100) / dockerMb)}
						tone={f === "too-small" ? "destructive" : f === "slower" ? "warning" : "success"}
						label="Memory the exam needs, of Docker's"
						className="flex-1"
					/>
				)}
				<span
					className={f === "slower" || f === "too-small" ? "text-warning" : "text-muted-foreground"}
				>
					{f === "unknown"
						? `Needs ~${gb(exam.memory_mb)} GB`
						: f === "too-small"
							? `Docker has ${gb(dockerMb ?? 0)} GB, at least ${gb(exam.minimum_mb)} GB needed: raise its memory limit`
							: f === "slower"
								? `Needs ~${gb(exam.memory_mb)} GB; Docker has ${gb(dockerMb ?? 0)} GB: it runs, slower`
								: `Needs ~${gb(exam.memory_mb)} GB of Docker's ${gb(dockerMb ?? 0)} GB`}
				</span>
			</div>

			<section>
				<h2 className="mb-3 font-bold text-lead">Start</h2>
				<div className="grid grid-cols-2 gap-3">
					<Mode
						icon={<Timer />}
						title="Exam"
						text="Timed and graded when you submit, as on the day. No hints, solutions or assistant."
					>
						<Button disabled={!ready} onClick={() => start(exam.id, "exam")}>
							Start exam
						</Button>
					</Mode>
					<Mode
						icon={<BookOpenCheck />}
						title="Practice"
						text={`Check each answer as you go, read hints and solutions,${assistant ? " ask Claude," : ""} and leave without grading.`}
					>
						<Button variant="outline" disabled={!ready} onClick={() => start(exam.id, "practice")}>
							Practice
						</Button>
					</Mode>
				</div>
			</section>
		</div>
	);
}

/**
 * The exam's description in two lines, the same height for every exam;
 * "Show more" lays it out whole, moving what follows down
 */
function Description({ text }: { text: string }) {
	const ref = useRef<HTMLParagraphElement>(null);
	const [open, setOpen] = useState(false);
	const [long, setLong] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: measured again for a new text
	useLayoutEffect(() => {
		const p = ref.current;
		if (p && !open) setLong(p.scrollHeight > p.clientHeight + 1);
	}, [text, open]);
	return (
		<div className="flex min-h-11 max-w-[62ch] flex-col items-start">
			<p
				ref={ref}
				className={cn("text-[14px] text-muted-foreground leading-[22px]", !open && "line-clamp-2")}
			>
				{text}
			</p>
			{(long || open) && (
				<Button
					variant="quiet"
					size="inline"
					className="mt-1 font-medium text-callout text-highlight hover:text-highlight/80"
					aria-expanded={open}
					onClick={() => setOpen(o => !o)}
				>
					{open ? "Show less" : "Show more"}
				</Button>
			)}
		</div>
	);
}

function Mode({
	icon,
	title,
	text,
	children,
}: {
	icon: ReactNode;
	title: string;
	text: string;
	children: ReactNode;
}) {
	return (
		<Card padding="lg" className="flex flex-col gap-2 [&>svg]:size-5 [&>svg]:text-muted-foreground">
			{icon}
			<h3 className="font-semibold text-lead">{title}</h3>
			<p className="flex-1 text-callout text-muted-foreground">{text}</p>
			<div className="pt-2">{children}</div>
		</Card>
	);
}
