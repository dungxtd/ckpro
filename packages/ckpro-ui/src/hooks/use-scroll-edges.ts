import { useEffect, useState } from "react";

/**
 * Marks a scroller with the edges that have more beyond them, for the
 * `fade-x` / `fade-y` utilities to fade: `data-more-start` (left or top),
 * `data-more-end` (right or bottom). Set as attributes, so scrolling renders
 * nothing. Sideways (`x`), a mouse wheel scrolls it too. Give the returned
 * setter as the scroller's ref
 */
export function useScrollEdges<T extends HTMLElement>(axis: "x" | "y") {
	const [element, ref] = useState<T | null>(null);
	useEffect(() => {
		if (!element) return;
		const edges = () => {
			const at = axis === "x" ? element.scrollLeft : element.scrollTop;
			const room = axis === "x" ? element.clientWidth : element.clientHeight;
			const all = axis === "x" ? element.scrollWidth : element.scrollHeight;
			element.toggleAttribute("data-more-start", at > 1);
			element.toggleAttribute("data-more-end", at + room < all - 1);
		};
		const wheel = (e: WheelEvent) => {
			if (element.scrollWidth <= element.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX))
				return;
			e.preventDefault();
			element.scrollLeft += e.deltaY;
		};
		edges();
		element.addEventListener("scroll", edges, { passive: true });
		if (axis === "x") element.addEventListener("wheel", wheel, { passive: false });
		// Its size or its content changing moves the edges too
		const watch = new ResizeObserver(edges);
		watch.observe(element);
		for (const child of element.children) watch.observe(child);
		return () => {
			element.removeEventListener("scroll", edges);
			element.removeEventListener("wheel", wheel);
			watch.disconnect();
		};
	}, [element, axis]);
	return [ref, element] as const;
}
