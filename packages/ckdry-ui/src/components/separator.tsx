import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";

/** Hairline between groups of content. */
export function Separator({
	orientation = "horizontal",
	className,
	...props
}: React.ComponentProps<"hr"> & { orientation?: "horizontal" | "vertical" }) {
	return (
		<hr
			aria-orientation={orientation}
			data-slot="separator"
			className={cn(
				"shrink-0 border-0 bg-border",
				orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
				className
			)}
			{...props}
		/>
	);
}
