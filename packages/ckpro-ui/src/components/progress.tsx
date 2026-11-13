import { cn } from "@ckpro/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

// The fill is the track's full width, slid back by what is left: a transform,
// so a change animates on the compositor, and the fill keeps its round end
// (scaling it would squash the end's curve)
const fill = cva(
	"block h-full w-full rounded-full transition-transform duration-300 ease-out motion-reduce:transition-none",
	{
		variants: {
			tone: {
				highlight: "bg-highlight",
				success: "bg-success",
				warning: "bg-warning",
				destructive: "bg-destructive",
			},
		},
		defaultVariants: { tone: "highlight" },
	}
);

// The track: thin by default, `md` where the bar is the point (an activity)
const track = cva("block w-full overflow-hidden rounded-full bg-foreground/10", {
	variants: { size: { sm: "h-1.5", md: "h-2" } },
	defaultVariants: { size: "sm" },
});

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** How far something is, 0–100, as a thin bar; `marker` draws a line across
 * it at a mark to reach (a pass line); `color` fills it with a colour of its
 * own instead of a tone (a score's, from a scale of tokens). `className`
 * places the bar (`flex-1` in a row); `size` sets its thickness */
export function Progress({
	value,
	label,
	tone,
	size,
	marker,
	color,
	className,
}: {
	value: number;
	label: string;
	marker?: number;
	color?: string;
	className?: string;
} & VariantProps<typeof fill> &
	VariantProps<typeof track>) {
	const percent = clamp(value);
	return (
		<span className={cn("relative block", className)}>
			<span
				role="progressbar"
				aria-label={label}
				aria-valuenow={Math.round(percent)}
				aria-valuemin={0}
				aria-valuemax={100}
				className={track({ size })}
			>
				<span
					className={fill({ tone })}
					style={{ transform: `translateX(${percent - 100}%)`, backgroundColor: color }}
				/>
			</span>
			{marker !== undefined && (
				<span
					aria-hidden
					className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/80"
					style={{ left: `${clamp(marker)}%` }}
				/>
			)}
		</span>
	);
}

/** How far something is, 0–100, as a ring around what it counts */
export function ProgressRing({
	value,
	label,
	children,
	className,
}: {
	value: number;
	label: string;
	children?: React.ReactNode;
	className?: string;
}) {
	const percent = clamp(value);
	return (
		<span
			role="progressbar"
			aria-label={label}
			aria-valuenow={Math.round(percent)}
			aria-valuemin={0}
			aria-valuemax={100}
			className={cn("grid size-20 shrink-0 place-items-center rounded-full", className)}
			style={{ background: `conic-gradient(var(--success) 0 ${percent}%, var(--muted) 0)` }}
		>
			<span className="grid size-[calc(100%-1rem)] place-items-center rounded-full bg-card font-semibold text-lg tabular-nums">
				{children}
			</span>
		</span>
	);
}
