import { Button } from "@ckdry/ui/components/button";
import { CircleCheck, CircleX, Sparkles } from "lucide-react";
import type { CheckResult } from "@/tauri/api";

/** Check results; `onWhy` adds a "Why?" to failing ones (the practice coach) */
export function CheckList({
	checks,
	onWhy,
}: {
	checks: CheckResult[];
	onWhy?: (check: CheckResult) => void;
}) {
	return (
		<ul className="flex flex-col gap-1 text-sm">
			{checks.map(check => (
				<li key={check.name} className="flex items-start gap-2">
					{check.passed ? (
						<CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
					) : (
						<CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
					)}
					<div className="min-w-0 flex-1">
						<span>{check.name}</span>
						<span className="text-muted-foreground text-xs"> · {check.weight} pt</span>
						{!check.passed && check.detail && (
							<div className="text-muted-foreground text-xs">{check.detail}</div>
						)}
					</div>
					{!check.passed && onWhy && (
						<Button
							size="push"
							variant="ghost"
							className="shrink-0 text-highlight"
							onClick={() => onWhy(check)}
						>
							<Sparkles /> Why?
						</Button>
					)}
				</li>
			))}
		</ul>
	);
}
