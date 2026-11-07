import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

/**
 * A section's title on a screen (Activity, Attempts, Start); `group`: the
 * small grey title over a group of rows (Settings, a day's lists)
 */
export function SectionTitle({
	as: Tag = "h2",
	size = "section",
	className,
	...props
}: React.ComponentProps<"h2"> & { as?: "h2" | "h3"; size?: "section" | "group" }) {
	return (
		<Tag
			className={cn(
				"font-semibold",
				size === "section" ? "text-lead" : "px-1 text-caption text-muted-foreground",
				className
			)}
			{...props}
		/>
	);
}
