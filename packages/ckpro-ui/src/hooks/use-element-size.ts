import { useEffect, useState } from "react";

/**
 * An element's size, followed as it changes: its content box, or with
 * `border` its whole box (padding and border too). Give the returned setter
 * as the element's ref; 0 by 0 until it is laid out
 */
export function useElementSize<T extends HTMLElement>({ border = false } = {}) {
	const [element, ref] = useState<T | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	useEffect(() => {
		if (!element) return;
		const watch = new ResizeObserver(([entry]) => {
			const box = border ? entry.borderBoxSize?.[0] : undefined;
			setSize(
				box
					? { width: box.inlineSize, height: box.blockSize }
					: { width: entry.contentRect.width, height: entry.contentRect.height }
			);
		});
		watch.observe(element, { box: border ? "border-box" : "content-box" });
		return () => watch.disconnect();
	}, [element, border]);
	return [ref, size, element] as const;
}
