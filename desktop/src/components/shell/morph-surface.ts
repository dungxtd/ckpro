import type * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** The sidebar's panel: 8px in from the window's edges, 248px wide, 12px round */
const PANEL = { inset: 8, width: 248, radius: 12 };
/** How long the shape takes to morph (main.tsx's transition, the columns'
 * too): the whole fold, the rows' and the capsule's fades within it */
export const MORPH_MS = 300;
/**
 * The window's one surface that is the sidebar's panel when it shows and
 * the capsule's pill when it is folded, as in macOS apps whose sidebar
 * folds into a floating pill. `clip` is its shape while it morphs (a
 * clip-path, animated from the one shape to the other); `root` goes on the
 * window's layout, and the folded shape is `capsule`'s box. Between morphs
 * it is not shown: the sidebar's panel and the capsule's pill are drawn by
 * themselves
 */
export function useMorphSurface(folded: boolean, capsule: React.RefObject<HTMLElement | null>) {
	const root = useRef<HTMLDivElement>(null);
	// Each fold or unfold is a new morph, its own time from its start (one
	// that comes mid-morph restarts the clock). Set as it renders, so the
	// first frame of the new shape already has its transition
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

	// The capsule's box, read as a fold begins (between morphs the sidebar
	// and the capsule draw their own shapes, CSS, so a window resizing moves
	// nothing here). `n`: the morph it was read for
	const [capsuleBox, setCapsuleBox] = useState({ n: -1, left: 0, top: 0, width: 0, height: 0 });
	// biome-ignore lint/correctness/useExhaustiveDependencies: read once per morph
	useLayoutEffect(() => {
		const r = root.current?.getBoundingClientRect();
		const c = capsule.current?.getBoundingClientRect();
		if (!r || !c) return;
		setCapsuleBox({
			n: morph.n,
			left: c.left - r.left,
			top: c.top - r.top,
			width: c.width,
			height: c.height,
		});
	}, [morph.n]);

	// The far sides as `100% - …`: right as the window is now, never as it
	// was when last read. Folding, the panel's shape holds until the capsule
	// is read for this morph: a target from an older reading (or none yet,
	// the window's corner) would send the shape there first
	const c = capsuleBox;
	const clip =
		folded && c.n === morph.n
			? `inset(${c.top}px calc(100% - ${c.left + c.width}px) calc(100% - ${c.top + c.height}px) ${c.left}px round ${c.height / 2}px)`
			: `inset(${PANEL.inset}px calc(100% - ${PANEL.inset + PANEL.width}px) ${PANEL.inset}px ${PANEL.inset}px round ${PANEL.radius}px)`;
	return { root, clip, morphing: morph.on };
}
