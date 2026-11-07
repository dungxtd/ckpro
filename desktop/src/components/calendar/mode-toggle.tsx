import { badgeVariants } from "@ckpro/ui/components/badge";
import { cn } from "@ckpro/ui/lib/utils";
import type { PlanView } from "@/tauri/api";

/**
 * How a plan is taken (Exam or Practice), as a badge that switches it;
 * `narrow`: in a month's cell, a letter until the calendar is wide
 */
export function ModeToggle({
	plan,
	onMode,
	narrow,
	className,
}: {
	plan: PlanView;
	onMode: (plan: PlanView) => void;
	narrow?: boolean;
	className?: string;
}) {
	const word = plan.mode === "exam" ? "Exam" : "Practice";
	return (
		<button
			type="button"
			aria-label={`${plan.title}: take it as ${plan.mode === "exam" ? "practice" : "an exam"}`}
			onClick={() => onMode(plan)}
			className={cn(
				badgeVariants({ variant: "accent" }),
				"cursor-pointer outline-none hover:bg-highlight/30 focus-visible:ring-1 focus-visible:ring-ring",
				narrow && "px-1 py-px text-3xs",
				className
			)}
		>
			{narrow ? (
				<>
					<span className="@4xl:hidden">{word[0]}</span>
					<span className="hidden @4xl:inline">{word}</span>
				</>
			) : (
				word
			)}
		</button>
	);
}
