import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";

/** Preformatted text (a command, a manifest, a log) on the muted surface.
 * Commands and manifests keep their lines (they scroll); `wrap` folds long
 * lines instead, for logs and messages read rather than copied. */
export const codeBlock = "overflow-auto whitespace-pre rounded-lg bg-muted p-2 font-mono text-xs";

export function CodeBlock({
	wrap,
	className,
	...props
}: React.ComponentProps<"pre"> & { wrap?: boolean }) {
	return (
		<pre
			data-slot="code-block"
			className={cn(codeBlock, wrap && "whitespace-pre-wrap break-words", className)}
			{...props}
		/>
	);
}
