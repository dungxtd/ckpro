import { cn } from "@ckpro/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type React from "react";

const spinnerVariants = cva("flex-col items-center justify-center", {
	variants: {
		show: {
			true: "inline-flex",
			false: "hidden",
		},
	},
	defaultVariants: {
		show: true,
	},
});

/* A ring with one quarter open, turning: symmetric about its centre, so it
 * turns in place at any size (an icon's arc wobbles as it snaps to pixels) */
const loaderVariants = cva(
	"block shrink-0 animate-spin rounded-full border-current border-r-transparent text-primary",
	{
		variants: {
			size: {
				// In a line of text or a button, in the text's colour; drawn a
				// little inside its 16px box, as an icon is
				inline: "m-px size-3.5 border-[1.5px] text-current",
				sm: "size-6 border-2",
				md: "size-8 border-[3px]",
				lg: "size-12 border-4",
			},
		},
		defaultVariants: {
			size: "md",
		},
	}
);

interface SpinnerContentProps
	extends VariantProps<typeof spinnerVariants>,
		VariantProps<typeof loaderVariants> {
	/** The ring's: its size (`size-3`) and colour */
	className?: string;
	/** Inside something that says it is loading already (`Loading`): not
	 * announced a second time */
	decorative?: boolean;
	children?: React.ReactNode;
}

export function Spinner({ size, show, decorative, children, className }: SpinnerContentProps) {
	return (
		<span className={spinnerVariants({ show })}>
			<span
				{...(decorative ? { "aria-hidden": true } : { role: "status", "aria-label": "Loading" })}
				className={cn(loaderVariants({ size }), className)}
			/>
			{children}
		</span>
	);
}
