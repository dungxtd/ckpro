import { useEffect, useState } from "react";

/**
 * An element's size, followed as it changes (its content box). Give the
 * returned setter as the element's ref; 0 by 0 until it is laid out
 */
export function useElementSize<T extends HTMLElement>() {
	const [element, ref] = useState<T | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	useEffect(() => {
		if (!element) return;
		const watch = new ResizeObserver(([entry]) =>
			setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
		);
		watch.observe(element);
		return () => watch.disconnect();
	}, [element]);
	return [ref, size, element] as const;
}
