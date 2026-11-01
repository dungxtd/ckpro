import { cn } from "@ckpro/ui/lib/utils";

export type StatusTone = "ok" | "warn" | "error" | "idle";

const TONE: Record<StatusTone, string> = {
	ok: "bg-success",
	warn: "bg-warning",
	error: "bg-destructive",
	idle: "bg-muted-foreground/40",
};

/** A status as a small coloured dot: fine, needs a look, broken, off */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
	return (
		<span className={cn("inline-block size-2 shrink-0 rounded-full", TONE[tone], className)} />
	);
}
