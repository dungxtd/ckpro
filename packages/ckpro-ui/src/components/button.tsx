import { pressMotion } from "@ckpro/ui/lib/motion";
import { cn, focusRing } from "@ckpro/ui/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

// The main action of an area takes the one accent, as macOS's default button
// (the action Return triggers) does: `default` and `pushDefault` are both
// that, at their sizes. Hover and press tint the fill: a `filter`
// (brightness) puts the button on its own layer in WebKit and its text
// visibly shifts
const accentFill =
	"bg-highlight text-highlight-foreground shadow-(--shadow-control) hover:bg-[color-mix(in_oklab,var(--highlight),white_10%)] active:bg-[color-mix(in_oklab,var(--highlight),black_12%)]";

const buttonVariants = cva(
	cn(
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
		focusRing,
		pressMotion
	),
	{
		variants: {
			variant: {
				default: accentFill,
				destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
				outline:
					"border border-input bg-glass shadow-xs hover:bg-accent hover:text-accent-foreground",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				// A destructive action that should not shout (End Exam)
				outlineDestructive:
					"border border-destructive/60 bg-transparent text-destructive hover:bg-destructive/10",
				// macOS default button, push-sized: the same accent fill as `default`
				pushDefault: accentFill,
				// macOS push button (System Settings "Change…"): a secondary action, raised
				// white in light, an edge on a faint fill in dark.
				push: "bg-[var(--push)] text-foreground shadow-(--shadow-push) hover:bg-[color-mix(in_oklab,var(--push),var(--foreground)_6%)] active:bg-[color-mix(in_oklab,var(--push),var(--foreground)_12%)]",
				// Ask the assistant (Review with the assistant, Why?): its own hue,
				// tinted, so it sits beside the main action without competing
				assistant: "bg-assistant/15 text-assistant hover:bg-assistant/25 active:bg-assistant/30",
				// A small action that stays out of the way (Copy, Regenerate, a
				// picker's value): muted text, the foreground on hover
				quiet: "font-normal text-muted-foreground hover:text-foreground",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 px-3 text-caption",
				push: "h-7 px-3 text-callout font-normal",
				/** Text-sized, no box: an action inside a line of small text */
				inline: "h-auto gap-1 p-0 text-2xs [&_svg]:size-3",
				/** A compact picker in a toolbar row: its value and a chevron */
				picker: "h-auto gap-0.5 rounded-md px-1.5 py-0.5 text-2xs hover:bg-hover [&_svg]:size-3",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
);

export type ButtonProps = React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	};

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
	const Comp = asChild ? Slot : "button";
	return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
