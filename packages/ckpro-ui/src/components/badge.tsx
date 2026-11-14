import { cn } from "@ckpro/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/** Small label chip: a status, a kind, in sentence case (a name in capitals,
 * CKA, stays so); `tag` and `warningTag` are the outlined notes beside a
 * choice (Recommended, More usage). */
export const badgeVariants = cva(
	"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-medium text-2xs leading-none",
	{
		variants: {
			variant: {
				subtle: "bg-accent text-accent-foreground",
				accent: "bg-highlight/15 text-highlight",
				success: "bg-success/15 text-success",
				destructive: "bg-destructive/15 text-destructive",
				warning: "bg-warning/15 text-warning",
				tag: "border border-current/35 opacity-75",
				warningTag: "border border-warning/60 bg-warning/10 text-warning",
			},
		},
		defaultVariants: { variant: "subtle" },
	}
);

export function Badge({
	variant,
	className,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
