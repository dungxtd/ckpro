import { panelMotion } from "@ckpro/ui/lib/motion";
import { cn, floatingPadding } from "@ckpro/ui/lib/utils";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import type * as React from "react";

/**
 * More about something the pointer rests on, in a card the pointer can go
 * onto (to scroll, select or click in it): it opens after a rest, stays
 * while the pointer is on the thing or the card, follows the thing as the
 * page scrolls, and closes a moment after the pointer leaves both
 */
function HoverCard({
	openDelay = 800,
	closeDelay = 200,
	...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
	return <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />;
}

const HoverCardTrigger = HoverCardPrimitive.Trigger;

/** The card, beside its thing; unstyled inside, the caller draws it */
function HoverCardContent({
	className,
	side = "right",
	align = "start",
	sideOffset = 6,
	collisionPadding,
	...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
	return (
		<HoverCardPrimitive.Portal>
			<HoverCardPrimitive.Content
				data-slot="hover-card-content"
				side={side}
				align={align}
				sideOffset={sideOffset}
				collisionPadding={collisionPadding ?? floatingPadding()}
				className={cn(
					"z-floating max-w-(--radix-hover-card-content-available-width) origin-(--radix-hover-card-content-transform-origin) outline-none",
					panelMotion,
					className
				)}
				{...props}
			/>
		</HoverCardPrimitive.Portal>
	);
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
