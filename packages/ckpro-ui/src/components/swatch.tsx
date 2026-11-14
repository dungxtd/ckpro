import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

const FILLED = {
	success: "bg-success",
	warning: "bg-warning/60",
	destructive: "bg-destructive/60",
	highlight: "bg-highlight",
	muted: "bg-muted-foreground/60",
} as const;

const RING = {
	success: "ring-success",
	warning: "ring-warning",
	destructive: "ring-destructive",
	highlight: "ring-highlight",
	muted: "ring-muted-foreground/60",
} as const;

/**
 * A small square that keys a colour: a score's tone beside an attempt, a
 * plan (`ring`: outlined, set for later), an exam in a menu, a map's
 * legend. `filled` in its tone, or `ring` outlined in it; `tone` left out,
 * the colour comes from `className` (a map's levels). sm 8px, md 10px.
 * Decorative: hidden from assistive technology
 */
export function Swatch({
	variant = "filled",
	tone,
	size = "md",
	className,
	...props
}: React.ComponentProps<"span"> & {
	variant?: "filled" | "ring";
	tone?: keyof typeof FILLED;
	size?: "sm" | "md";
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"block shrink-0 rounded-xs",
				size === "sm" ? "size-2" : "size-2.5",
				variant === "ring" && "ring-[1.5px] ring-inset",
				tone && (variant === "ring" ? RING[tone] : FILLED[tone]),
				className
			)}
			{...props}
		/>
	);
}
