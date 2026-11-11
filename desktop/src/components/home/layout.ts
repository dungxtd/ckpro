import type { HomeLayout } from "@/tauri/api";

/** Home's grid: 4 columns of fixed width, rows of fixed height */
export const COLUMNS = 4;
export const ROW_PX = 118;
export const GAP_PX = 14;
/** Narrower than this, two columns in the saved order */
export const NARROW_PX = 600;

/** A module's size, in columns × rows: small, wide, wider, wider and tall,
 * tall, large */
export type ModuleSize = "s" | "w" | "x" | "y" | "t" | "l";
export const SPAN: Record<ModuleSize, [number, number]> = {
	s: [1, 1],
	w: [2, 1],
	x: [3, 1],
	y: [3, 2],
	t: [1, 2],
	l: [2, 2],
};

export type Place = { x: number; y: number };
/** Where each module shown sits */
export type Places = Record<string, Place>;

type Box = { x: number; y: number; w: number; h: number };
const box = (p: Place, size: ModuleSize): Box => ({
	x: p.x,
	y: p.y,
	w: SPAN[size][0],
	h: SPAN[size][1],
});
const hits = (a: Box, b: Box) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The places once nothing overlaps: `first` keeps its cell; any other module
 * it covers moves down until free (and what that one covers, in turn); a row
 * left with nothing in it closes up. Nothing else moves: gaps beside modules
 * stay, as the candidate left them
 */
export function settle(places: Places, sizeOf: (id: string) => ModuleSize, first?: string): Places {
	const next: Places = {};
	for (const [id, p] of Object.entries(places))
		next[id] = {
			x: Math.min(Math.max(0, p.x), COLUMNS - SPAN[sizeOf(id)][0]),
			y: Math.max(0, p.y),
		};
	const ids = Object.keys(next);
	const placed = first && next[first] ? [first] : [];
	const rest = ids
		.filter(id => id !== first)
		.sort((a, b) => next[a].y - next[b].y || next[a].x - next[b].x);
	for (const id of rest) {
		while (placed.some(o => hits(box(next[id], sizeOf(id)), box(next[o], sizeOf(o))))) next[id].y++;
		placed.push(id);
	}
	const bottom = Math.max(0, ...ids.map(id => next[id].y + SPAN[sizeOf(id)][1]));
	for (let row = bottom - 1; row >= 0; row--)
		if (!ids.some(id => next[id].y <= row && row < next[id].y + SPAN[sizeOf(id)][1]))
			for (const id of ids) if (next[id].y > row) next[id].y--;
	return next;
}

/** The modules in reading order: by row, then column (the narrow window's order) */
export const reading = (places: Places) =>
	Object.keys(places).sort((a, b) => places[a].y - places[b].y || places[a].x - places[b].x);

/**
 * The places Home shows: the default for what there is (`defaults`) until
 * the candidate arranges it; then theirs, a module that came since at the
 * bottom. Only the modules `shown`; the hidden ones stay out
 */
export function arrange(
	saved: HomeLayout,
	shown: string[],
	defaults: Places,
	sizeOf: (id: string) => ModuleSize
): Places {
	const visible = shown.filter(id => !(saved.hidden ?? []).includes(id));
	const places: Places = {};
	if (!saved.custom) {
		for (const id of visible) places[id] = defaults[id] ?? { x: 0, y: 999 };
	} else {
		const kept = new Map((saved.places ?? []).map(p => [p.module, { x: p.x, y: p.y }]));
		for (const id of visible) places[id] = kept.get(id) ?? { x: 0, y: 999 };
	}
	return settle(places, sizeOf);
}

/** The layout to save: every module's place as it is now, and the hidden ones */
export function toSaved(places: Places, hidden: string[], previous: HomeLayout): HomeLayout {
	const kept = (previous.places ?? []).filter(p => !(p.module in places));
	return {
		custom: true,
		hidden,
		places: [...kept, ...Object.entries(places).map(([module, p]) => ({ module, x: p.x, y: p.y }))],
	};
}
