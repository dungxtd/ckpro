import { cn } from "@ckpro/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/** An inline message: a tinted box, with an optional leading icon. */
export const alertVariants = cva(
	"flex select-text gap-2 rounded-lg border [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				info: "border-border bg-muted/50",
				success: "border-success/40 bg-success/10 [&>svg]:text-success",
				warning: "border-warning/40 bg-warning/10 [&>svg]:text-warning",
				destructive: "border-destructive/40 bg-destructive/10 [&>svg]:text-destructive",
			},
			size: {
				md: "p-3 text-sm",
				/** In a narrow pane or under a control */
				sm: "px-3 py-1.5 text-caption",
			},
		},
		defaultVariants: { variant: "info", size: "md" },
	}
);

export function Alert({
	variant,
	size,
	className,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return (
		<div
			data-slot="alert"
			// Errors interrupt a screen reader; the rest wait their turn
			role={variant === "destructive" ? "alert" : "status"}
			className={cn(alertVariants({ variant, size }), className)}
			{...props}
		/>
	);
}
