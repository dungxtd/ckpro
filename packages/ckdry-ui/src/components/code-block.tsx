import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";

/** Preformatted text (a command, a manifest, a log) on the muted surface.
 * Commands and manifests keep their lines (they scroll); `wrap` folds long
 * lines instead, for logs and messages read rather than copied. */
export const codeBlock = "overflow-auto whitespace-pre rounded-lg bg-muted p-2 font-mono text-xs";

export function CodeBlock({
	wrap,
	title,
	actions,
	className,
	...props
}: React.ComponentProps<"pre"> & {
	wrap?: boolean;
	/** With a header: a framed box, the title (a language, as a pill) left, `actions` right */
	title?: React.ReactNode;
	actions?: React.ReactNode;
}) {
	const framed = title !== undefined || actions !== undefined;
	const pre = (
		<pre
			data-slot="code-block"
			className={cn(
				codeBlock,
				wrap && "whitespace-pre-wrap break-words",
				framed && "rounded-none bg-transparent p-2.5",
				className
			)}
			{...props}
		/>
	);
	if (!framed) return pre;
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card">
			<div className="flex items-center gap-2 border-border border-b px-2.5 py-1">
				{typeof title === "string" ? (
					<span className="rounded bg-border px-1.5 py-0.5 font-medium text-[10px] uppercase">
						{title}
					</span>
				) : (
					title
				)}
				<span className="ml-auto flex items-center gap-1">{actions}</span>
			</div>
			{pre}
		</div>
	);
}
