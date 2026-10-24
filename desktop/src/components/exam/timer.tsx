import { Tooltip, TooltipContent, TooltipTrigger } from "@ckdry/ui/components/tooltip";
import { cn } from "@ckdry/ui/lib/utils";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

const format = (ms: number) => {
	const total = Math.max(0, Math.floor(ms / 1000));
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

/** Time left in exam mode (amber under 30 minutes, red under 10, as the
 * alerts go), time spent in practice mode. A toolbar pill, 28px like the
 * other controls. */
export function Timer({ startedAt, endsAt }: { startedAt: number; endsAt: number | null }) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);

	const left = endsAt === null ? null : endsAt - now;
	const minutes = left === null ? null : left / 60_000;
	const tone = minutes === null || minutes >= 30 ? "normal" : minutes >= 10 ? "warning" : "low";
	const label = left === null ? "Time spent" : "Time left";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					role="timer"
					aria-label={label}
					className={cn(
						"flex h-7 items-center gap-1.5 rounded-segment bg-[var(--seg-bg)] px-2.5 font-medium text-callout tabular-nums transition-colors",
						tone === "warning" && "text-warning",
						tone === "low" && "bg-destructive/15 text-destructive"
					)}
				>
					<Clock className={cn("size-3.5", tone === "normal" && "text-muted-foreground")} />
					{format(left ?? now - startedAt)}
				</span>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
