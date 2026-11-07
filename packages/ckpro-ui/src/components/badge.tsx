import { cn } from "@ckpro/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/** Small label chip: a status, a kind, in sentence case (a name in capitals,
 * CKA, stays so); `tag` and `warningTag` are the outlined notes beside a
 * choice (Recommended, More usage). `BadgeButton` is one that acts (a plan's
 * mode it switches); `size="narrow"` fits a calendar cell. */
export const badgeVariants = cva(
	"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] font-medium text-2xs leading-none",
	{
		variants: {
			variant: {
				solid: "bg-foreground text-background",
				subtle: "bg-accent text-accent-foreground",
				accent: "bg-highlight/15 text-highlight",
				success: "bg-success/15 text-success",
				destructive: "bg-destructive/15 text-destructive",
				// Over a picture: stays dark in both themes.
				overlay: "bg-black/60 text-white backdrop-blur-sm",
				tag: "border border-current/35 opacity-75",
				warningTag: "border border-warning/60 bg-warning/10 text-warning",
			},
			size: {
				default: "",
				narrow: "px-1 py-px text-3xs",
			},
		},
		defaultVariants: { variant: "subtle", size: "default" },
	}
);

export function Badge({
	variant,
	className,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** A badge that acts when clicked: the same look, a hover and a focus ring */
export function BadgeButton({
	variant,
	size,
	className,
	...props
}: React.ComponentProps<"button"> & VariantProps<typeof badgeVariants>) {
	return (
		<button
			type="button"
			className={cn(
				badgeVariants({ variant, size }),
				"cursor-pointer outline-none transition-colors hover:opacity-80 focus-visible:ring-1 focus-visible:ring-ring",
				// Accent deepens instead, as a selected row's tint does
				variant === "accent" && "hover:bg-highlight/30 hover:opacity-100",
				className
			)}
			{...props}
		/>
	);
}
