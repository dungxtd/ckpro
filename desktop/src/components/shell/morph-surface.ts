import { useLayoutEffect, useRef, useState } from "react";

/** The sidebar's panel: 8px in from the window's edges, 248px wide, 12px round */
const PANEL = { inset: 8, width: 248, radius: 12 };
/**
 * The window's one surface that is the sidebar's panel when it shows and
 * the capsule's pill when it is folded, as in macOS apps whose sidebar
 * folds into a floating pill. `clip` is its shape (a clip-path, which
 * animates between the two); `root` goes on the window's layout and
 * `capsule` on the capsule, whose size the folded shape takes
 */
export function useMorphSurface(folded: boolean) {
	const root = useRef<HTMLDivElement>(null);
	const capsule = useRef<HTMLElement>(null);
	const [box, setBox] = useState({ width: 0, height: 0, left: 0, top: 0, cw: 0, ch: 0 });
	useLayoutEffect(() => {
		const measure = () => {
			const r = root.current;
			const c = capsule.current;
			if (!r || !c) return;
			// Where the capsule is, not where it would be centred in the
			// window: it is centred over the content, which an inspector narrows
			const outer = r.getBoundingClientRect();
			const inner = c.getBoundingClientRect();
			setBox({
				width: r.clientWidth,
				height: r.clientHeight,
				left: inner.left - outer.left,
				top: inner.top - outer.top,
				cw: c.offsetWidth,
				ch: c.offsetHeight,
			});
		};
		measure();
		const watch = new ResizeObserver(measure);
		if (root.current) watch.observe(root.current);
		if (capsule.current) watch.observe(capsule.current);
		// The bar it is centred in, which an inspector or the sidebar resizes
		if (capsule.current?.parentElement) watch.observe(capsule.current.parentElement);
		return () => watch.disconnect();
	}, []);

	const { width, height, left, top, cw, ch } = box;
	const clip = folded
		? `inset(${top}px ${width - left - cw}px ${height - top - ch}px ${left}px round ${ch / 2}px)`
		: `inset(${PANEL.inset}px ${width - PANEL.inset - PANEL.width}px ${PANEL.inset}px ${PANEL.inset}px round ${PANEL.radius}px)`;
	return { root, capsule, clip };
}
