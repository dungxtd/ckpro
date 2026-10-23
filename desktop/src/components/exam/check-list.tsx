import { CircleCheck, CircleX } from "lucide-react";
import type { CheckResult } from "@/tauri/api";

export function CheckList({ checks }: { checks: CheckResult[] }) {
	return (
		<ul className="flex flex-col gap-1 text-sm">
			{checks.map(check => (
				<li key={check.name} className="flex items-start gap-2">
					{check.passed ? (
						<CircleCheck className="mt-0.5 size-4 shrink-0 text-green-500" />
					) : (
						<CircleX className="mt-0.5 size-4 shrink-0 text-red-500" />
					)}
					<div>
						<span>{check.name}</span>
						<span className="text-muted-foreground text-xs"> · {check.weight} pt</span>
						{!check.passed && check.detail && (
							<div className="text-muted-foreground text-xs">{check.detail}</div>
						)}
					</div>
				</li>
			))}
		</ul>
	);
}
