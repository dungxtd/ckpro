import { cn } from "@ckdry/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const fill = cva("block h-full rounded-full transition-[width] duration-500", {
	variants: {
		tone: {
			highlight: "bg-highlight",
			success: "bg-success",
			warning: "bg-warning",
			destructive: "bg-destructive",
		},
	},
	defaultVariants: { tone: "highlight" },
});

/** How far something is, 0–100, as a thin bar. */
export function Progress({
	value,
	label,
	tone,
	className,
}: { value: number; label: string; className?: string } & VariantProps<typeof fill>) {
	const percent = Math.max(0, Math.min(100, value));
	return (
		<span
			role="progressbar"
			aria-label={label}
			aria-valuenow={Math.round(percent)}
			aria-valuemin={0}
			aria-valuemax={100}
			className={cn("block h-1.5 overflow-hidden rounded-full bg-muted", className)}
		>
			<span className={fill({ tone })} style={{ width: `${percent}%` }} />
		</span>
	);
}

export type ProgressTone = NonNullable<VariantProps<typeof fill>["tone"]>;
