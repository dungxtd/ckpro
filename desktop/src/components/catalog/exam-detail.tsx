import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Progress } from "@ckdry/ui/components/progress";
import { Stat, StatGroup } from "@ckdry/ui/components/stat";
import { BookOpenCheck, Timer } from "lucide-react";
import type { ReactNode } from "react";
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
			<header>
				<Badge>{exam.certification.toUpperCase()}</Badge>
				<h1 className="mt-2 min-w-0 break-words font-bold text-[28px] leading-tight">
					{exam.title}
				</h1>
				<p className="mt-2 max-w-[60ch] text-lead text-muted-foreground">{exam.description}</p>
			</header>

			<StatGroup>
				<Stat value={exam.questions} label={exam.questions === 1 ? "question" : "questions"} />
				<Stat value={`${exam.duration_minutes} min`} label="time" />
				<Stat value={`${exam.pass_score}%`} label="to pass" />
				<Stat value={exam.nodes} label="nodes" />
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
