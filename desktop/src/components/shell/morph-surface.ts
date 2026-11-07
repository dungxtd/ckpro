import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** The sidebar's panel: 8px in from the window's edges, 248px wide, 12px round */
const PANEL = { inset: 8, width: 248, radius: 12 };
/** How long the shape takes to morph (main.tsx's transition) */
export const MORPH_MS = 450;
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
	const [box, setBox] = useState({ width: 0, height: 0, right: 0, top: 0, cw: 0, ch: 0 });
	useLayoutEffect(() => {
		const measure = () => {
			const r = root.current;
			const c = capsule.current;
			const bar = c?.parentElement;
			if (!r || !c || !bar) return;
			// The capsule is centred over the content, from the window's left
			// edge (the sidebar folded) to the bar's right one (an inspector's
			// edge, or the window's). Only the right edge is measured: the left
			// one moves while the sidebar slides, and the shape must not chase it
			const outer = r.getBoundingClientRect();
			const edges = bar.getBoundingClientRect();
			const next = {
				width: r.clientWidth,
				height: r.clientHeight,
				right: edges.right - outer.left,
				top: edges.top - outer.top + (edges.height - c.offsetHeight) / 2,
				cw: c.offsetWidth,
				ch: c.offsetHeight,
			};
			setBox(box =>
				Object.keys(next).every(k => box[k as keyof typeof box] === next[k as keyof typeof next])
					? box
					: next
			);
		};
		measure();
		const watch = new ResizeObserver(measure);
		if (root.current) watch.observe(root.current);
		if (capsule.current) watch.observe(capsule.current);
		// The bar, which an inspector resizes
		if (capsule.current?.parentElement) watch.observe(capsule.current.parentElement);
		return () => watch.disconnect();
	}, []);

	// The shape moves only as the sidebar folds or unfolds; anything else (an
	// inspector opening with a screen) puts it in place at once, as the
	// capsule itself is. Set as it renders, so the first frame of the new
	// shape already has its transition
	const [morphing, setMorphing] = useState(false);
	const [was, setWas] = useState(folded);
	if (was !== folded) {
		setWas(folded);
		setMorphing(true);
	}
	useEffect(() => {
		if (!morphing) return;
		const done = setTimeout(() => setMorphing(false), MORPH_MS);
		return () => clearTimeout(done);
	}, [morphing]);

	const { width, height, right, top, cw, ch } = box;
	const left = (right - cw) / 2;
	const clip = folded
		? `inset(${top}px ${width - left - cw}px ${height - top - ch}px ${left}px round ${ch / 2}px)`
		: `inset(${PANEL.inset}px ${width - PANEL.inset - PANEL.width}px ${PANEL.inset}px ${PANEL.inset}px round ${PANEL.radius}px)`;
	return { root, capsule, clip, morphing };
}
