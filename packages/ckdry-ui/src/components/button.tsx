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
				secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
				accent: "bg-accent text-accent-foreground shadow-xs hover:bg-accent/80",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				// macOS push button (System Settings "Change…"): raised, hairline shadow.
				// macOS default button (the action Return triggers): accent fill.
				pushDefault:
					"bg-highlight text-highlight-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.12)] transition-[filter] hover:brightness-110 active:brightness-90",
				push: "bg-[var(--seg-on)] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.12)] transition-[filter] hover:brightness-95 active:brightness-90 dark:hover:brightness-110",
				// Hero actions (Apple TV style): solid white primary, glass secondary.
				// Both grow slightly on hover and shrink on press, like IconButton.
				solid:
					"hover-glow bg-white text-black shadow-sm [text-shadow:none] transition-[transform,scale,background-color,filter] hover:bg-white [@media(hover:hover)]:hover:scale-[1.04] active:scale-95 [&_svg]:fill-current",
				glass:
					"hover-glow glass-surface glass-blur text-foreground transition-[transform,scale,background-color,filter] hover:bg-foreground/15 [@media(hover:hover)]:hover:scale-[1.04] active:scale-95",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 rounded-md px-3 text-xs",
				lg: "h-10 rounded-md px-8",
				pill: "h-11 rounded-full px-7 font-semibold text-lead [&_svg]:size-[18px]",
				push: "h-7 rounded-control px-3 text-callout font-normal",
				xl: "h-12 rounded-md px-10 text-md",
				xxl: "h-14 rounded-md px-12 text-lg",
				iconXl: "size-12 px-4 py-2 [&_svg]:size-6",
				icon3Xl: "size-20 px-4 py-2 [&_svg]:size-12",
				icon: "size-10 [&_svg]:size-6",
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
