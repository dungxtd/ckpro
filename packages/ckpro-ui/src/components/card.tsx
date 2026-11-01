import { cn } from "@ckpro/ui/lib/utils";
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

/** A card's title, and what it is about at the end of the same line */
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div className={cn("mb-3 flex items-baseline justify-between gap-3", className)} {...props} />
	);
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
	return <h2 className={cn("font-semibold text-lead", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={cn("text-caption text-muted-foreground", className)} {...props} />;
}
