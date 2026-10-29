import { cn } from "@ckdry/ui/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring-3 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
				destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
				outline:
					"border border-input bg-glass shadow-xs hover:bg-accent hover:text-accent-foreground",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				// macOS push button (System Settings "Change…"): raised, hairline shadow.
				// macOS default button (the action Return triggers): accent fill.
				// Hover and press tint the fill: a `filter` (brightness) puts the
				// button on its own layer in WebKit and its text visibly shifts
				pushDefault:
					"bg-highlight text-highlight-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.12)] hover:bg-[color-mix(in_oklab,var(--highlight),white_10%)] active:bg-[color-mix(in_oklab,var(--highlight),black_12%)]",
				push: "bg-[var(--seg-on)] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.12)] hover:bg-[color-mix(in_oklab,var(--seg-on),var(--foreground)_6%)] active:bg-[color-mix(in_oklab,var(--seg-on),var(--foreground)_12%)]",
				// Over a picture: solid white primary, glass secondary.
				// Both grow slightly on hover and shrink on press, like IconButton.
				solid:
					"hover-glow bg-white text-black shadow-sm [text-shadow:none] transition-[transform,scale,background-color,filter] hover:bg-white [@media(hover:hover)]:hover:scale-[1.04] active:scale-95 [&_svg]:fill-current",
				glass:
					"hover-glow glass-surface glass-blur text-foreground transition-[transform,scale,background-color,filter] hover:bg-foreground/15 [@media(hover:hover)]:hover:scale-[1.04] active:scale-95",
				// A small action that stays out of the way (Copy, Regenerate, a
				// picker's value): muted text, the foreground on hover
				quiet: "font-normal text-muted-foreground hover:text-foreground",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 rounded-md px-3 text-xs",
				pill: "h-11 rounded-full px-7 font-semibold text-lead [&_svg]:size-[18px]",
				push: "h-7 rounded-control px-3 text-callout font-normal",
				/** Text-sized, no box: an action inside a line of small text */
				inline: "h-auto gap-1 p-0 text-2xs [&_svg]:size-3",
				/** A compact picker in a toolbar row: its value and a chevron */
				picker:
					"h-auto gap-0.5 rounded px-1.5 py-0.5 text-2xs hover:bg-foreground/5 [&_svg]:size-3",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : "button";
		return (
			<Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
		);
	}
);
Button.displayName = "Button";

export { Button, buttonVariants };
