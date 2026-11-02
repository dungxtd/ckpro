import { cn } from "@cktry/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type * as React from "react";

/** A row that shows or hides what is under it (a log, details). */
export function Disclosure({
	summary,
	open,
	onOpenChange,
	className,
	children,
}: {
	summary: React.ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div data-slot="disclosure" className={className}>
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
