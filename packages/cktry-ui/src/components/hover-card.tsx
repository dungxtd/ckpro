import { useThemeScope } from "@cktry/ui/components/theme-scope";
import { cn, floatingPadding } from "@cktry/ui/lib/utils";
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
	const theme = useThemeScope();
	return (
		<HoverCardPrimitive.Portal>
			<HoverCardPrimitive.Content
				data-slot="hover-card-content"
				data-theme={theme}
				side={side}
				align={align}
				sideOffset={sideOffset}
				collisionPadding={collisionPadding ?? floatingPadding()}
				className={cn(
					"z-floating max-w-(--radix-hover-card-content-available-width) origin-(--radix-hover-card-content-transform-origin) outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
					className
				)}
				{...props}
			/>
		</HoverCardPrimitive.Portal>
	);
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
