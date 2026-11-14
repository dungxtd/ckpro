import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

/**
 * A section's title on a screen (Activity, Attempts, Start); `lead`: one
 * inline beside the screen's controls, on one line (a week's name); `group`:
 * the small grey title over a group of rows (Settings, a day's lists)
 */
export function SectionTitle({
	as: Tag = "h2",
	size = "section",
	className,
	...props
}: React.ComponentProps<"h2"> & { as?: "h2" | "h3"; size?: "section" | "lead" | "group" }) {
	return (
		<Tag
			className={cn(
				"font-semibold",
				size === "group"
					? "px-1 text-caption text-muted-foreground"
					: size === "lead"
						? "truncate text-lead leading-tight"
						: "text-lead",
				className
			)}
			{...props}
		/>
	);
}
