import { buttonVariants } from "@ckpro/ui/components/button";
import { cn } from "@ckpro/ui/lib/utils";
import type React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// A compact notice pill at the top right, under the title bar (clear of what
// is being done below), on the popover surface
// of the theme (solid, its floating shadow and hairline): 32px high, its icon,
// its text at the callout size, its action, and a round close button always at
// the end, so it covers little of what it reports on. Its text is one line,
// cut short when long (lead with what happened: "Deleted <name>"). A success
// shows a green icon and an error a red one; the text stays the popover's,
// which reads on it in both themes. Sonner injects its own unlayered CSS, so
// the overrides are !important.
const Toaster = ({ toastOptions, ...props }: ToasterProps) => (
	<Sonner
		position="top-right"
		// The title bar is 48px; the window's own buttons stay clear
		offset={{ top: 56, right: 16 }}
		gap={8}
		// Small enough to list: an Undo is never hidden behind a newer notice
		expand
		closeButton
		className="toaster group cursor-default select-none"
		style={
			{
				"--normal-bg": "var(--popover)",
				"--normal-text": "var(--popover-foreground)",
				"--normal-border": "transparent",
				"--border-radius": "var(--radius-toast)",
			} as React.CSSProperties
		}
		toastOptions={{
			...toastOptions,
			classNames: {
				// Pill fits its text, anchored right; sonner's fixed 356px width (and
				// full-window width under 600px) is overridden.
				toast:
					"!left-auto !right-0 !w-fit !max-w-[min(420px,calc(100vw-48px))] !min-h-8 !gap-2 !rounded-full !py-[5px] !pr-[5px] !pl-3 !text-callout !font-medium !shadow-(--shadow-float) [&_[data-icon]]:!m-0 [&_[data-icon]]:!size-4 [&_[data-icon]_svg]:size-4",
				success: "[&_[data-icon]]:!text-success",
				error: "[&_[data-icon]]:!text-destructive",
				// One line: a long name is cut, never wrapping the pill
				title: "!truncate",
				// Under the title, in its colour, softer (sonner's own grey is too faint)
				description: "!truncate !font-normal !text-(--normal-text) !opacity-75",
				// Plain ✕ at the end of the pill (sonner pins it to the top-left corner).
				closeButton:
					"!static !order-[99] !ml-0.5 !size-[22px] !shrink-0 !transform-none !rounded-full !border-0 !bg-fill-quiet !text-popover-foreground/75 hover:!bg-foreground/15 hover:!text-popover-foreground [&_svg]:!size-3",
				// Action ("Release Notes"): the kit's small button sizing, coloured from the
				// pill's own variables (--normal-text on a faint tint of itself), so it
				// follows whatever the pill is. Sonner's own unlayered button CSS needs
				// the ! overrides.
				actionButton: cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"!order-[98] !ml-1 !h-[22px] !shrink-0 !rounded-full !border-0 !bg-[color-mix(in_srgb,var(--normal-text)_10%,transparent)] !px-2.5 !text-caption !font-semibold !text-(--normal-text) hover:!bg-[color-mix(in_srgb,var(--normal-text)_18%,transparent)]"
				),
				content: "!min-w-0 !flex-1",
				...toastOptions?.classNames,
			},
		}}
		{...props}
	/>
);

export { Toaster };
