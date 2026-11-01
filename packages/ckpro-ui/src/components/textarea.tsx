import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

/**
 * Multi-line text, growing with its content (up to `max-h`). bare: no frame
 * of its own, for a composer that draws the frame around it and its buttons.
 */
function Textarea({
	variant = "default",
	className,
	...props
}: React.ComponentProps<"textarea"> & { variant?: "default" | "bare" }) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"field-sizing-content block w-full min-w-0 resize-none text-sm outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50",
				variant === "default" &&
					"glass-surface min-h-16 rounded-lg px-3 py-2 focus-visible:ring-[3px] focus-visible:ring-ring/50",
				variant === "bare" && "bg-transparent",
				className
			)}
			{...props}
		/>
	);
}

export { Textarea };
