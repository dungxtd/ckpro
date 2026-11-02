import { Tooltip, TooltipContent, TooltipTrigger } from "@cktry/ui/components/tooltip";
import { cn } from "@cktry/ui/lib/utils";
import { type ReactNode, useRef, useState } from "react";

/**
 * One line of text cut short with an ellipsis; hovering it shows the whole
 * text, only when it was cut. `full` is shown instead, and always (what a
 * short label stands for: a description, the default it means).
 */
function Truncated({
	children,
	full,
	className,
	...props
}: React.ComponentProps<"span"> & { full?: ReactNode }) {
	const ref = useRef<HTMLSpanElement>(null);
	const [open, setOpen] = useState(false);
	const isCut = () => !!ref.current && ref.current.scrollWidth > ref.current.clientWidth;
	return (
		<Tooltip open={open} onOpenChange={next => setOpen(next && (full !== undefined || isCut()))}>
			<TooltipTrigger asChild>
				<span ref={ref} className={cn("min-w-0 truncate", className)} {...props}>
					{children}
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-80 whitespace-normal">{full ?? children}</TooltipContent>
		</Tooltip>
	);
}

export { Truncated };
