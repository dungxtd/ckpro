import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

/** A value or a name inside a line of text (a namespace, a flag), in
 * monospace on a quiet tint that reads on the page, a card or a popover in
 * either theme; a little smaller than the text around it. A colour of its
 * own comes from the caller (`text-exam-value`). */
export const inlineCode = "rounded-sm bg-fill-quiet px-1.5 py-0.5 font-mono text-[0.9em]";

export function InlineCode({ className, ...props }: React.ComponentProps<"code">) {
	return <code className={cn(inlineCode, "select-text", className)} {...props} />;
}
