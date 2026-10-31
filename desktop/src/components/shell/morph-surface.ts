import { useLayoutEffect, useRef, useState } from "react";

/** The sidebar's panel: 8px in from the window's edges, 248px wide, 12px round */
const PANEL = { inset: 8, width: 248, radius: 12 };
/** The title bar's height, the capsule centred in it */
const BAR = 48;

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
	const [box, setBox] = useState({ width: 0, height: 0, capsuleWidth: 0, capsuleHeight: 0 });
	useLayoutEffect(() => {
		const measure = () => {
			const r = root.current;
			const c = capsule.current;
			if (!r || !c) return;
			setBox({
				width: r.clientWidth,
				height: r.clientHeight,
				capsuleWidth: c.offsetWidth,
				capsuleHeight: c.offsetHeight,
			});
		};
		measure();
		const watch = new ResizeObserver(measure);
		if (root.current) watch.observe(root.current);
		if (capsule.current) watch.observe(capsule.current);
		return () => watch.disconnect();
	}, []);

	const { width, height, capsuleWidth: cw, capsuleHeight: ch } = box;
	// Folded, the capsule is centred in a title bar the window's width
	const top = (BAR - ch) / 2;
	const side = (width - cw) / 2;
	const clip = folded
		? `inset(${top}px ${side}px ${height - top - ch}px ${side}px round ${ch / 2}px)`
		: `inset(${PANEL.inset}px ${width - PANEL.inset - PANEL.width}px ${PANEL.inset}px ${PANEL.inset}px round ${PANEL.radius}px)`;
	return { root, capsule, clip };
}
