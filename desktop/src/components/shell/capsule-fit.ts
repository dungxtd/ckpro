/**
 * How the capsule fits the room it has in the title bar: every name in full
 * when it fits, else the Dock's way (an icon each, the current one marked),
 * the least used folded into a menu when even the icons do not fit
 */

/** An icon's width, the gap between two and the capsule's own padding, as
 * laid out (capsule-nav.tsx measures them) */
export type DockMetrics = { item: number; gap: number; pad: number };

/** The capsule's width with `n` icons */
export const dockWidth = (m: DockMetrics, n: number) =>
	2 * m.pad + n * m.item + Math.max(0, n - 1) * m.gap;

export type Fit =
	| { mode: "full" }
	/** `shown`: how many icons stay, the menu of the rest not counted */
	| { mode: "dock"; shown: number };

/** The way the capsule shows in `room` px, its names taking `fullWidth`, with `count` items */
export function fitCapsule(fullWidth: number, count: number, room: number, m: DockMetrics): Fit {
	if (fullWidth <= room) return { mode: "full" };
	if (dockWidth(m, count) <= room) return { mode: "dock", shown: count };
	// One slot goes to the menu of the folded ones; the current one always stays
	let shown = count - 1;
	while (shown > 1 && dockWidth(m, shown + 1) > room) shown--;
	return { mode: "dock", shown };
}

/** The capsule's width as it fits */
export const fitWidth = (fit: Fit, fullWidth: number, count: number, m: DockMetrics) =>
	fit.mode === "full" ? fullWidth : dockWidth(m, fit.shown < count ? fit.shown + 1 : fit.shown);

/**
 * Where the capsule's left edge goes: centred in the window when it fits
 * between `left` and `right` (what it must not cover: the window's buttons,
 * an inspector), else only as far from the centre as it must
 */
export function placeCapsule(windowWidth: number, left: number, right: number, width: number) {
	const centred = (windowWidth - width) / 2;
	return Math.max(left, Math.min(centred, right - width));
}

/**
 * Which items fold first when there is no room: search, then Settings, the
 * exams, the screens from the last, the sidebar's button last; never `current`
 */
export function foldOrder(keys: string[], current: string | undefined) {
	const tail = ["search", "/settings", "/exams"];
	const screens = keys.filter(k => !tail.includes(k) && k !== "sidebar").reverse();
	return [...tail.filter(k => keys.includes(k)), ...screens, "sidebar"].filter(
		k => k !== current && keys.includes(k)
	);
}
