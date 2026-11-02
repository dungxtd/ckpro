import { cn } from "@cktry/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/** An inline message: a tinted box, with an optional leading icon. */
export const alertVariants = cva(
	"flex gap-2 rounded-lg border p-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				info: "border-border bg-muted/50",
				success: "border-success/40 bg-success/10 [&>svg]:text-success",
				warning: "border-warning/40 bg-warning/10 [&>svg]:text-warning",
				destructive: "border-destructive/40 bg-destructive/10 [&>svg]:text-destructive",
			},
		},
		defaultVariants: { variant: "info" },
	}
);

export function Alert({
	variant,
	className,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return (
		<div
			data-slot="alert"
			// Errors interrupt a screen reader; the rest wait their turn
			role={variant === "destructive" ? "alert" : "status"}
			className={cn(alertVariants({ variant }), className)}
			{...props}
		/>
	);
}
