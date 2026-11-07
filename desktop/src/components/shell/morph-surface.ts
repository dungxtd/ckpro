import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CapsuleBox } from "./capsule-nav";

/** The sidebar's panel: 8px in from the window's edges, 248px wide, 12px round */
const PANEL = { inset: 8, width: 248, radius: 12 };
/** How long the shape takes to morph (main.tsx's transition) */
export const MORPH_MS = 450;
/**
 * The window's one surface that is the sidebar's panel when it shows and
 * the capsule's pill when it is folded, as in macOS apps whose sidebar
 * folds into a floating pill. `clip` is its shape (a clip-path, which
 * animates between the two); `root` goes on the window's layout, and the
 * folded shape is `capsule`'s box
 */
export function useMorphSurface(folded: boolean, capsule: CapsuleBox | null) {
	const root = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	useLayoutEffect(() => {
		const r = root.current;
		if (!r) return;
		const measure = () => setSize({ width: r.clientWidth, height: r.clientHeight });
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(r);
		return () => watch.disconnect();
	}, []);

	// The shape moves only as the sidebar folds or unfolds; anything else (an
	// inspector opening with a screen, the capsule fitting a narrower window)
	// puts it in place at once, as the capsule itself is. Set as it renders,
	// so the first frame of the new shape already has its transition
	// Each fold or unfold is a new morph, its own time from its start (one
	// that comes mid-morph restarts the clock)
	const [morph, setMorph] = useState({ folded, n: 0, on: false });
	if (morph.folded !== folded) setMorph({ folded, n: morph.n + 1, on: true });
	useEffect(() => {
		if (!morph.on) return;
		const done = setTimeout(
			() => setMorph(m => (m.n === morph.n ? { ...m, on: false } : m)),
			MORPH_MS
		);
		return () => clearTimeout(done);
	}, [morph.n, morph.on]);
	const morphing = morph.on;

	const { width, height } = size;
	// The capsule is placed in the window's pixels (capsule-nav.tsx), so its
	// box is the folded shape as it is
	const c = capsule ?? { left: width / 2, top: 6, width: 0, height: 36 };
	const clip = folded
		? `inset(${c.top}px ${width - c.left - c.width}px ${height - c.top - c.height}px ${c.left}px round ${c.height / 2}px)`
		: `inset(${PANEL.inset}px ${width - PANEL.inset - PANEL.width}px ${PANEL.inset}px ${PANEL.inset}px round ${PANEL.radius}px)`;
	return { root, clip, morphing };
}
