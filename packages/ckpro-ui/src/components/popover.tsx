import { useThemeScope } from "@ckpro/ui/components/theme-scope";
import { cn } from "@ckpro/ui/lib/utils";
import { useDismissableLayerSurface } from "@radix-ui/react-dismissable-layer";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type * as React from "react";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

/** Floating panel on the same macOS menu material as menus and dropdowns. */
function PopoverContent({
	className,
	align = "start",
	sideOffset = 8,
	collisionPadding = 8,
	onOpenAutoFocus,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
	const theme = useThemeScope();
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				data-slot="popover-content"
				data-theme={theme}
				align={align}
				sideOffset={sideOffset}
				collisionPadding={collisionPadding}
				// The panel takes the focus, not its first control: a stepper's
				// minus or a menu's first row is not chosen (or ringed) by opening
				// it; Tab reaches them
				onOpenAutoFocus={
					onOpenAutoFocus ??
					(e => {
						e.preventDefault();
						(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
					})
				}
				className={cn(
					// Never larger than the room the window leaves: long lists scroll
					"menu-surface z-floating max-h-(--radix-popover-content-available-height) w-80 max-w-(--radix-popover-content-available-width) overflow-y-auto",
					"origin-(--radix-popover-content-transform-origin) rounded-[16px] p-3.5 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
					className
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverContent, PopoverTrigger };

/**
 * A ref for an area that handles its own pointer events and stops them (a
 * remote desktop's canvas, an embedded editor). Popovers, menus and dialogs
 * otherwise read that as "handled there" and stay open; a press on the area
 * closes them like any press outside.
 */
export const useDismissSurface = useDismissableLayerSurface;
