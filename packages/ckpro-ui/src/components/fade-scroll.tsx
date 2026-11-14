import { useScrollEdges } from "@ckpro/ui/hooks/use-scroll-edges";
import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";
import { useCallback } from "react";

/**
 * A scroller whose content fades where there is more beyond the edge, no
 * scroll bar showing: `y` a list taller than its box, `x` a shelf or a map
 * wider than it (a mouse wheel scrolls it sideways too). `ref` reaches the
 * scroller itself
 */
export function FadeScroll({
	axis = "y",
	className,
	ref,
	...props
}: React.ComponentProps<"div"> & { axis?: "x" | "y" }) {
	const [edges] = useScrollEdges<HTMLDivElement>(axis);
	const both = useCallback(
		(element: HTMLDivElement | null) => {
			edges(element);
			if (typeof ref === "function") ref(element);
			else if (ref) ref.current = element;
		},
		[edges, ref]
	);
	return (
		<div
			ref={both}
			className={cn(
				"no-scrollbar",
				axis === "x" ? "fade-x overflow-x-auto" : "fade-y overflow-y-auto",
				className
			)}
			{...props}
		/>
	);
}
