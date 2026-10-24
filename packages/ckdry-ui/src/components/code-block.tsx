import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";

/** Preformatted text (a command, a manifest, a log) on the muted surface; scrolls, never wraps. */
export const codeBlock = "overflow-auto whitespace-pre rounded-lg bg-muted p-2 font-mono text-xs";

export function CodeBlock({ className, ...props }: React.ComponentProps<"pre">) {
	return <pre data-slot="code-block" className={cn(codeBlock, className)} {...props} />;
}
