import { cn, focusRing } from "@ckpro/ui/lib/utils";
import type * as React from "react";

/**
 * A list row pressed as a whole (a plan to start): one button over the row
 * and under what else it holds, whose own buttons stay pressable above it
 * (`relative`). The row is `relative`; the button names what it does
 */
export function RowCover({ className, ...props }: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			className={cn(
				"absolute inset-0 rounded-[inherit] disabled:cursor-default",
				focusRing,
				className
			)}
			{...props}
		/>
	);
}
