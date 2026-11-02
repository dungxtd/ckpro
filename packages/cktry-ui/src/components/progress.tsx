import { cn } from "@cktry/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

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

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** How far something is, 0–100, as a thin bar; `marker` draws a line across
 * it at a mark to reach (a pass line) */
export function Progress({
	value,
	label,
	tone,
	marker,
	className,
}: {
	value: number;
	label: string;
	marker?: number;
	className?: string;
} & VariantProps<typeof fill>) {
	const percent = clamp(value);
	return (
		<span className="relative block">
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
			<span className="grid size-[calc(100%-1rem)] place-items-center rounded-full bg-card font-bold text-lg tabular-nums">
				{children}
			</span>
		</span>
	);
}

export type ProgressTone = NonNullable<VariantProps<typeof fill>["tone"]>;
