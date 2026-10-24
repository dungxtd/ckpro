import { Tooltip, TooltipContent, TooltipTrigger } from "@ckdry/ui/components/tooltip";
import { cn } from "@ckdry/ui/lib/utils";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

const format = (ms: number) => {
	const total = Math.max(0, Math.floor(ms / 1000));
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

/** Time left in exam mode (red under 10 minutes), time spent in practice mode. */
export function Timer({ startedAt, endsAt }: { startedAt: number; endsAt: number | null }) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);

	const left = endsAt === null ? null : endsAt - now;
	const low = left !== null && left < 10 * 60 * 1000;
	const label = left === null ? "Time spent" : "Time left";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					role="timer"
					aria-label={label}
					className={cn(
						"flex items-center gap-1.5 rounded-control border px-2.5 py-1 font-mono text-sm tabular-nums",
						low
							? "border-destructive/60 bg-destructive/15 text-destructive"
							: "border-success/50 bg-success/15 text-success"
					)}
				>
					<Clock className="size-4" />
					{format(left ?? now - startedAt)}
				</span>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
