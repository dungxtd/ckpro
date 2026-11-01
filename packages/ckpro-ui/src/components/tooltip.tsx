import { useThemeScope } from "@ckpro/ui/components/theme-scope";
import { cn, floatingPadding } from "@ckpro/ui/lib/utils";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type * as React from "react";

/** Wait a beat before showing, so sweeping the cursor across a row stays quiet. */
const DELAY_MS = 150;

/** Root with its own provider, so a tooltip works anywhere without extra setup. */
function Tooltip({
	delayDuration = DELAY_MS,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
	return (
		<TooltipPrimitive.Provider delayDuration={delayDuration}>
			<TooltipPrimitive.Root {...props} />
		</TooltipPrimitive.Provider>
	);
}

const TooltipTrigger = TooltipPrimitive.Trigger;

/** Small label on the solid popover surface with a hairline, like dialogs and sheets. */
function TooltipContent({
	className,
	children,
	sideOffset = 3,
	collisionPadding,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
	const theme = useThemeScope();
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				data-slot="tooltip-content"
				data-theme={theme}
				sideOffset={sideOffset}
				// Placement is the tooltip's own business: it opens on top by default and
				// flips below when the room above is the title-bar strip (window buttons),
				// so no caller has to say where it goes.
				collisionPadding={collisionPadding ?? floatingPadding()}
				className={cn(
					"z-floating w-fit origin-(--radix-tooltip-content-transform-origin) whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs tabular-nums shadow-md data-[state=closed]:animate-out data-[state=delayed-open]:animate-in data-[state=instant-open]:animate-in data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=instant-open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95 data-[state=instant-open]:zoom-in-95",
					className
				)}
				{...props}
			>
				{children}
				{/* A square turned 45deg in the label's own colour, half under the label,
				    so only its two outer edges show (with the same hairline). */}
				<TooltipPrimitive.Arrow asChild>
					<div className="size-2.5 -translate-y-[calc(50%+0.5px)] rotate-45 rounded-br-[2px] border-r border-b border-border bg-popover" />
				</TooltipPrimitive.Arrow>
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipContent, TooltipTrigger };
