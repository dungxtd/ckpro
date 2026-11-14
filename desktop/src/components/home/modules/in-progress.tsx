import { cn } from "@ckpro/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { ModuleCard } from "@/components/home/modules/module-card";
import { useExam, useExamBusy } from "@/stores/exam";
import { shortTitle } from "@/titles";

/** An exam tried and not passed yet: its title, best score and pass line */
export type Unpassed = { examId: string; title: string; best: number; pass: number };

/** The exams tried and not passed yet, the latest on top of a small fan;
 * Continue practises it again */
export function InProgress({ exams }: { exams: Unpassed[] }) {
	const askStart = useExam(s => s.askStart);
	const busy = useExamBusy();
	const top = exams[0];
	const tints = ["bg-highlight/80", "bg-assistant/80", "bg-warning/80"];
	return (
		<ModuleCard className="relative">
			<span className="font-semibold text-title tabular-nums leading-none">{exams.length}</span>
			<span className="text-caption text-muted-foreground">
				{exams.length ? "not passed yet" : "Every exam tried is passed"}
			</span>
			{top && (
				<button
					type="button"
					disabled={busy}
					onClick={() => askStart(top.examId, "practice", top.title)}
					className="absolute top-3.5 right-4 z-10 flex items-center text-caption text-highlight hover:underline disabled:opacity-50"
				>
					Continue
					<ChevronRight className="size-3.5" />
				</button>
			)}
			<div aria-hidden className="absolute right-3 -bottom-5 h-20 w-28">
				{exams.slice(0, 3).map((e, i) => (
					<span
						key={e.examId}
						className={cn(
							"absolute bottom-0 h-[70px] w-14 rounded-md p-1.5 font-semibold text-[9px] text-highlight-foreground leading-tight shadow-(--shadow-control)",
							tints[i],
							i === 0
								? "left-6 z-[2] rotate-2"
								: i === 1
									? "left-0 -rotate-6"
									: "left-12 rotate-[10deg]"
						)}
					>
						{shortTitle(e.title)}
					</span>
				))}
			</div>
		</ModuleCard>
	);
}
