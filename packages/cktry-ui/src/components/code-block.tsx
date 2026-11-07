import { cn } from "@cktry/ui/lib/utils";
import type * as React from "react";

/** Preformatted text (a command, a manifest, a log) in an inset well: the
 * page's darkest surface with a hairline edge, so it stands apart on a card,
 * a popover or the page alike (in dark, `muted` is the card's own colour).
 * Commands and manifests keep their lines (they scroll); `wrap` folds long
 * lines instead, for logs and messages read rather than copied. */
export const codeBlock =
	"overflow-auto whitespace-pre rounded-lg border border-border bg-background p-2 font-mono text-xs";

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
				"select-text",
				wrap && "whitespace-pre-wrap break-words",
				framed && "rounded-none border-0 bg-transparent p-2.5",
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
					<span className="rounded bg-border px-1.5 py-0.5 font-medium text-3xs uppercase">
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
