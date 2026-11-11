import { capsuleTint } from "@ckpro/ui/components/capsule";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ckpro/ui/components/tooltip";
import { pressMotion } from "@ckpro/ui/lib/motion";
import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";
import { useRef, useState } from "react";

export type IconButtonVariant = "glass" | "plain" | "toolbar" | "capsule";
export type IconButtonSize = "xs" | "bar" | "sm" | "md" | "lg" | "auto";

export interface IconButtonOptions {
	/**
	 * glass: round dark-glass circle with a lit rim (actions over a picture:
	 * close, remove). plain: no wrap, just the icon (the top bar, navigation).
	 * toolbar: a dense panel's buttons: square, a tint on hover, no growing.
	 * capsule: a destination in the floating capsule, round, its tint the
	 * capsule's (`aria-current`: the screen shown).
	 */
	variant?: IconButtonVariant;
	/** xs 24px · bar 28px (the top bars) · sm 32px · md 40px · lg 48px · auto: caller sizes the box and icon. */
	size?: IconButtonSize;
	/** Selected / toggled on: opaque glass fill, like the active header tab. */
	active?: boolean;
}

/**
 * The one style for icon-only buttons across the app. Every variant gives a
 * little under a press; only `glass`, over a picture, grows and glows on
 * hover (a tint would not show there). The others tint or brighten.
 */
export function iconButtonVariants({
	variant = "glass",
	size = "md",
	active,
}: IconButtonOptions = {}) {
	return cn(
		"inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
		pressMotion,
		// Over a picture: grows and glows under the pointer
		variant === "glass" &&
			"hover-glow glass-blur bg-black/35 text-white shadow-(--shadow-glass-rim) hover:bg-black/55 motion-safe:[@media(hover:hover)]:hover:scale-110",
		variant === "plain" && "opacity-80 hover:opacity-100",
		variant === "capsule" && capsuleTint,
		variant === "toolbar" &&
			"rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-40",
		size === "xs" && "size-6 [&_svg]:size-3.5",
		size === "bar" && "size-7 [&_svg]:size-4",
		size === "sm" && "size-8 [&_svg]:size-4",
		size === "md" && "size-10 [&_svg]:size-5",
		size === "lg" && "size-12 [&_svg]:size-6",
		// A toolbar's button stays in its square: a tint, not the glass fill
		active &&
			(variant === "toolbar"
				? "bg-foreground/12 text-foreground"
				: "glass-selected text-glass-selected-foreground opacity-100")
	);
}

type IconButtonProps = React.ComponentProps<"button"> & IconButtonOptions;

/**
 * An icon says nothing until you hover it: its `title` (or, failing that, its
 * `aria-label`) shows as a tooltip, the kit's own, not the browser's.
 */
export function IconButton({
	variant,
	size,
	active,
	className,
	type = "button",
	title,
	...props
}: IconButtonProps) {
	const ariaLabel = props["aria-label"];
	const label = title ?? (typeof ariaLabel === "string" ? ariaLabel : undefined);
	const ref = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);
	const button = (
		<button
			type={type}
			className={cn(iconButtonVariants({ variant, size, active }), className)}
			{...props}
			// Its own, and a wrapping trigger's (a menu's, passed as a prop)
			ref={el => {
				ref.current = el;
				const outer = props.ref;
				if (typeof outer === "function") outer(el);
				else if (outer) outer.current = el;
			}}
		/>
	);
	if (!label) return button;
	return (
		<Tooltip
			open={open}
			// Hovered, or focused from the keyboard: not when a menu it opened
			// closes and hands the focus back
			onOpenChange={next =>
				setOpen(
					next &&
						!!ref.current &&
						(ref.current.matches(":hover") || ref.current.matches(":focus-visible"))
				)
			}
		>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
