import { Tooltip, TooltipContent, TooltipTrigger } from "@ckpro/ui/components/tooltip";
import { useNow } from "@ckpro/ui/hooks/use-now";
import { hoursClock as format } from "@ckpro/ui/lib/time";
import { cn } from "@ckpro/ui/lib/utils";
import { Clock } from "lucide-react";

/** Time left in exam mode (amber under 30 minutes, red under 10, as the
 * alerts go), time spent in practice mode. A toolbar pill, 28px like the
 * other controls. */
export function Timer({ startedAt, endsAt }: { startedAt: number | null; endsAt: number | null }) {
	const now = useNow();

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
					// On the segmented controls' track (their fill and radius), as
					// the toolbar's other 28px controls sit
					className={cn(
						"flex h-7 items-center gap-1.5 rounded-lg bg-[var(--seg-bg)] px-2.5 font-medium text-callout tabular-nums transition-colors",
						tone === "warning" && "text-warning",
						tone === "low" && "bg-destructive/15 text-destructive"
					)}
				>
					<Clock className={cn("size-3.5", tone === "normal" && "text-muted-foreground")} />
					{/* A start not known: no time made up */}
					{left !== null ? format(left) : startedAt !== null ? format(now - startedAt) : "--:--:--"}
				</span>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
