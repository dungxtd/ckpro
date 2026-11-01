import { cn } from "@ckdry/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/** Small label chip: a status, a kind; `tag` and `warningTag` are the
 * rounded, normal-case notes beside a menu choice (Recommended, More usage). */
export const badgeVariants = cva(
	"inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-bold text-3xs uppercase leading-none tracking-wide",
	{
		variants: {
			variant: {
				solid: "bg-foreground text-background",
				subtle: "bg-accent text-accent-foreground",
				success: "bg-success/15 text-success",
				destructive: "bg-destructive/15 text-destructive",
				// Over a picture: stays dark in both themes.
				overlay: "bg-black/60 text-white backdrop-blur-sm",
				tag: "rounded-full border border-current/35 px-2 font-medium text-2xs normal-case tracking-normal opacity-75",
				warningTag:
					"rounded-full border border-warning/60 bg-warning/10 px-2 font-medium text-2xs text-warning normal-case tracking-normal",
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
