import { cn } from "@ckpro/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type * as React from "react";

/**
 * A compact row that opens something under it (a step's log, a tool call):
 * its hover and focus, for rows laid out by their own screen
 */
export const disclosureRow =
	"flex items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring";

/** A row that shows or hides what is under it (a log, details). */
export function Disclosure({
	summary,
	open,
	onOpenChange,
	id,
	className,
	children,
}: {
	summary: React.ReactNode;
	/** To scroll to it, or link to it */
	id?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div id={id} data-slot="disclosure" className={className}>
			<button
				type="button"
				aria-expanded={open}
				onClick={() => onOpenChange(!open)}
				className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5"
			>
				<ChevronRight
					className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
				/>
				{summary}
			</button>
			{open && <div className="px-3 py-3">{children}</div>}
		</div>
	);
}
