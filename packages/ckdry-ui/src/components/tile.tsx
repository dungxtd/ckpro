import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";

/** A square shortcut on a card: an icon over its name (a section to go to) */
export function Tile({
	icon,
	label,
	className,
	type = "button",
	...props
}: React.ComponentProps<"button"> & { icon: React.ReactNode; label: React.ReactNode }) {
	return (
		<button
			type={type}
			className={cn(
				"flex h-24 w-32 shrink-0 select-none flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-2 text-center text-caption font-medium outline-none hover:bg-[color-mix(in_oklab,var(--card),var(--foreground)_5%)] focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-6 [&_svg]:text-foreground/80",
				className
			)}
			{...props}
		>
			{icon}
			{label}
		</button>
	);
}
