import { buttonVariants } from "@ckdry/ui/components/button";
import { cn } from "@ckdry/ui/lib/utils";
import type React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Apple-style glass pill: blurred translucent dark surface, lit rim (no outline),
// 22px radius (a pill on one line, softer when text wraps), soft shadow — the same in both themes. The close button sits
// inline at the end. Sonner injects its own
// unlayered CSS, so the overrides are !important.
const Toaster = ({ toastOptions, ...props }: ToasterProps) => (
	<Sonner
		className="toaster group cursor-default select-none"
		style={
			{
				"--normal-bg": "rgba(30, 30, 32, 0.6)",
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
					"!left-auto !right-0 !w-fit !max-w-[min(420px,calc(100vw-48px))] !rounded-[22px] !px-[18px] !py-2.5 !text-sm !font-medium !shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_0_0_0.5px_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.4)] !backdrop-blur-[34px] !backdrop-saturate-[1.6] [&_[data-icon]_svg]:size-[15px]",
				// Plain ✕ at the end of the pill (sonner pins it to the top-left corner).
				closeButton:
					"!static !order-last !ml-1 !size-5 !shrink-0 !transform-none !border-0 !bg-transparent !text-white/60 hover:!bg-transparent hover:!text-white [&_svg]:!size-3.5",
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
