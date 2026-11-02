import { cn } from "@cktry/ui/lib/utils";
import type * as React from "react";

/**
 * What a surface will show, faded, while it has nothing to show yet: the
 * sample is drawn behind (hidden from assistive technology and the pointer),
 * a line of what to do and an action over it
 */
export function Placeholder({
	sample,
	title,
	description,
	action,
	className,
}: {
	sample: React.ReactNode;
	title?: React.ReactNode;
	description?: React.ReactNode;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("relative", className)}>
			<div aria-hidden inert className="pointer-events-none opacity-20 blur-[1.5px] grayscale">
				{sample}
			</div>
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
				{title && <div className="font-semibold text-callout">{title}</div>}
				{description && <div className="text-caption text-muted-foreground">{description}</div>}
				{action && <div className="mt-2">{action}</div>}
			</div>
		</div>
	);
}
