import { Tooltip, TooltipContent, TooltipTrigger } from "@ckdry/ui/components/tooltip";
import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";
import { useRef, useState } from "react";

export type IconButtonVariant = "glass" | "plain" | "toolbar";
export type IconButtonSize = "xs" | "bar" | "sm" | "md" | "lg" | "auto";

export interface IconButtonOptions {
	/**
	 * glass: round dark-glass circle with a lit rim (actions over a picture:
	 * close, remove). plain: no wrap, just the icon (the top bar, navigation).
	 * toolbar: a dense panel's buttons: square, a tint on hover, no growing.
	 */
	variant?: IconButtonVariant;
	/** xs 24px · bar 28px (the top bars) · sm 32px · md 40px · lg 48px · auto: caller sizes the box and icon. */
	size?: IconButtonSize;
	/** Selected / toggled on: opaque glass fill, like the active header tab. */
	active?: boolean;
}

/**
 * The one style for icon-only buttons across the app. Same motion for every
 * variant: hover grows it slightly, press shrinks it. No colour changes on
 * hover.
 */
export function iconButtonVariants({
	variant = "glass",
	size = "md",
	active,
}: IconButtonOptions = {}) {
	return cn(
		"hover-glow inline-flex shrink-0 transition-[transform,scale,background-color,opacity,filter] duration-200 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:pointer-events-none disabled:opacity-50 [@media(hover:hover)]:hover:scale-110",
		variant === "glass" &&
			"glass-blur bg-black/35 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),inset_0_0_0_0.5px_rgb(255_255_255/0.12)] hover:bg-black/55",
		variant === "plain" && "opacity-80 hover:opacity-100",
		variant === "toolbar" &&
			"rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground active:scale-100 [@media(hover:hover)]:hover:scale-100 disabled:opacity-40",
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
