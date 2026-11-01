import { buttonVariants } from "@ckdry/ui/components/button";
import { cn } from "@ckdry/ui/lib/utils";
import type React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// A macOS notice pill at the bottom right: a near-solid dark grey surface
// with a hairline rim, its icon and text in white, semibold, and a close
// button always at the end; 22px radius (a pill on one line, softer when
// text wraps), the same in both themes. Sonner injects its own unlayered
// CSS, so the overrides are !important.
const Toaster = ({ toastOptions, ...props }: ToasterProps) => (
	<Sonner
		position="bottom-right"
		offset={{ bottom: 20, right: 20 }}
		closeButton
		className="toaster group cursor-default select-none"
		style={
			{
				"--normal-bg": "rgba(44, 44, 46, 0.96)",
				"--normal-text": "rgba(255, 255, 255, 0.96)",
				"--normal-border": "transparent",
				"--border-radius": "22px",
			} as React.CSSProperties
		}
		toastOptions={{
			...toastOptions,
			classNames: {
				// Pill fits its text, anchored right; sonner's fixed 356px width (and
				// full-window width under 600px) is overridden.
				toast:
					"!left-auto !right-0 !w-fit !max-w-[min(420px,calc(100vw-48px))] !gap-2.5 !rounded-[22px] !py-2.5 !pr-2.5 !pl-4 !text-[14px] !font-semibold !shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12),0_8px_28px_rgba(0,0,0,0.35)] !backdrop-blur-[30px] [&_[data-icon]]:!text-white [&_[data-icon]_svg]:size-[17px]",
				// Plain ✕ at the end of the pill (sonner pins it to the top-left corner).
				closeButton:
					"!static !order-last !ml-1.5 !size-6 !shrink-0 !transform-none !rounded-full !border-0 !bg-transparent !text-white/70 hover:!bg-white/10 hover:!text-white [&_svg]:!size-3.5",
				// Action ("Release Notes"): the kit's small button sizing, coloured from the
				// pill's own variables (--normal-text on a faint tint of itself), so it
				// follows whatever the pill is. Not a themed glass fill: the pill is dark in
				// both themes, and a white one turned the label invisible. Sonner's own
				// unlayered button CSS needs the ! overrides.
				actionButton: cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"!order-last !ml-2 !h-7 !shrink-0 !rounded-full !border-0 !bg-[color-mix(in_srgb,var(--normal-text)_16%,transparent)] !px-3 !font-semibold !text-(--normal-text) hover:!bg-[color-mix(in_srgb,var(--normal-text)_28%,transparent)]"
				),
				content: "!flex-1",
				...toastOptions?.classNames,
			},
		}}
		{...props}
	/>
);

export { Toaster };
