import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

/**
 * A floating pill of destinations over the content: what the sidebar folds
 * into. Translucent, so the content shows through it as it scrolls.
 */
export function Capsule({ className, ...props }: React.ComponentProps<"nav">) {
	return (
		<nav
			className={cn(
				"flex select-none items-center gap-0.5 rounded-full bg-capsule p-1 shadow-[var(--capsule-shadow),inset_0_0_0_0.5px_var(--capsule-edge)] backdrop-blur-xl backdrop-saturate-150",
				className
			)}
			{...props}
		/>
	);
}

/** A destination's tint in the capsule, a name or an icon (icon-button's
 * `capsule`): the screen shown (`aria-current`) and an open menu tinted */
export const capsuleTint =
	"text-foreground/75 hover:bg-sidebar-selected hover:text-foreground aria-[current]:bg-sidebar-selected aria-[current]:text-foreground data-[state=open]:bg-sidebar-selected";

/** One destination in the capsule; `current`: the one shown now */
export function CapsuleItem({
	current,
	className,
	type = "button",
	...props
}: React.ComponentProps<"button"> & { current?: boolean }) {
	return (
		<button
			type={type}
			aria-current={current ? "page" : undefined}
			className={cn(
				"inline-flex h-7 items-center gap-1 rounded-full px-3 font-semibold text-callout outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
				capsuleTint,
				className
			)}
			{...props}
		/>
	);
}
