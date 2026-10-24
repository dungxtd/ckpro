import { cn } from "@ckdry/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/**
 * A grouped surface (a System Settings box): the card colour with a hairline
 * edge. dashed: an empty slot, or something listed that the app does not own.
 */
export const cardVariants = cva("rounded-xl border border-border text-card-foreground", {
	variants: {
		variant: {
			default: "bg-card",
			dashed: "border-dashed bg-transparent",
		},
		padding: {
			none: "",
			sm: "p-3",
			md: "p-4",
			lg: "p-6",
		},
	},
	defaultVariants: { variant: "default", padding: "md" },
});

export function Card({
	variant,
	padding,
	className,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
	return (
		<div
			data-slot="card"
			className={cn(cardVariants({ variant, padding }), className)}
			{...props}
		/>
	);
}
