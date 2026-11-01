import type { ExamSort, ExamSummary, HistoryEntry, SidebarLayout } from "@/tauri/api";

const CERT_ORDER = ["cka", "ckad", "cks"];

/** Where `key` falls in `order`: its place there, or after every placed one
 * (then in its `fallback` place) */
const rank = (order: string[], key: string, fallback: number) => {
	const i = order.indexOf(key);
	return i >= 0 ? i : order.length + fallback;
};

/** An exam's last attempt: when it started, and its score */
export type ExamStats = Map<string, { last: number; score: number | null }>;

/** Each exam's latest finished attempt, from the history */
export function examStats(history: HistoryEntry[]): ExamStats {
	const stats: ExamStats = new Map();
	for (const h of history) {
		const last = h.result.started_at ?? 0;
		if ((stats.get(h.exam_id)?.last ?? -1) < last)
			stats.set(h.exam_id, { last, score: h.result.score });
	}
	return stats;
}

/** The ways a certification's exams sort, by name in its menu */
export const SORTS: { value: ExamSort; label: string }[] = [
	{ value: "manual", label: "Manually" },
	{ value: "recent", label: "Recently practised" },
	{ value: "score", label: "Lowest score" },
	{ value: "name", label: "Name" },
];

export interface Group {
	cert: string;
	exams: ExamSummary[];
	collapsed: boolean;
	sort: ExamSort;
}

/** Exams in a certification's sort: as dragged (the rest as they come), by
 * name, practised most recently first, or lowest last score first (never
 * practised ones first: they need it most) */
function sorted(exams: ExamSummary[], sort: ExamSort, layout: SidebarLayout, stats: ExamStats) {
	const placed = exams.map((e, i) => ({ e, i, at: rank(layout.exams, e.id, i) }));
	const by = {
		manual: (a: (typeof placed)[0], b: (typeof placed)[0]) => a.at - b.at,
		name: (a: (typeof placed)[0], b: (typeof placed)[0]) => a.e.title.localeCompare(b.e.title),
		recent: (a: (typeof placed)[0], b: (typeof placed)[0]) =>
			(stats.get(b.e.id)?.last ?? -1) - (stats.get(a.e.id)?.last ?? -1) || a.at - b.at,
		score: (a: (typeof placed)[0], b: (typeof placed)[0]) =>
			(stats.get(a.e.id)?.score ?? -1) - (stats.get(b.e.id)?.score ?? -1) || a.at - b.at,
	}[sort];
	return placed.sort(by).map(p => p.e);
}

/**
 * The exams by certification as the sidebar lists them: certifications in
 * the order dragged (the rest after, as they come), each one's exams in its
 * sort, pinned exams left out (they are listed above them all) and hidden
 * certifications too unless `withHidden`
 */
export function arrange(
	catalog: ExamSummary[],
	layout: SidebarLayout,
	withHidden = false,
	stats: ExamStats = new Map()
): Group[] {
	const certs = [...new Set(catalog.map(e => e.certification))];
	const fallback = (c: string) => {
		const i = CERT_ORDER.indexOf(c);
		return i >= 0 ? i : CERT_ORDER.length + certs.indexOf(c);
	};
	return certs
		.filter(c => withHidden || !layout.hidden.includes(c))
		.sort((a, b) => rank(layout.groups, a, fallback(a)) - rank(layout.groups, b, fallback(b)))
		.map(cert => {
			const sort = layout.sort[cert] ?? "manual";
			const exams = catalog.filter(e => e.certification === cert && !layout.pinned.includes(e.id));
			return {
				cert,
				sort,
				collapsed: layout.collapsed.includes(cert),
				exams: sorted(exams, sort, layout, stats),
			};
		});
}

/** The pinned exams, in the order pinned or dragged (gone ones left out) */
export const pinned = (catalog: ExamSummary[], layout: SidebarLayout) =>
	layout.pinned.flatMap(id => catalog.find(e => e.id === id) ?? []);

/** `list` with `item` moved to just before or after `target` */
export function moved(list: string[], item: string, target: string, after: boolean): string[] {
	if (item === target) return list;
	const rest = list.filter(x => x !== item);
	const at = rest.indexOf(target);
	if (at < 0) return list;
	rest.splice(after ? at + 1 : at, 0, item);
	return rest;
}

/** `list` with `item` one place earlier (-1) or later (1) */
export function stepped(list: string[], item: string, by: -1 | 1): string[] {
	const i = list.indexOf(item);
	const j = i + by;
	if (i < 0 || j < 0 || j >= list.length) return list;
	const next = [...list];
	[next[i], next[j]] = [next[j], next[i]];
	return next;
}

/** `list` with `item` in it, or out of it */
export const toggled = (list: string[], item: string, on: boolean) =>
	on ? [...new Set([...list, item])] : list.filter(x => x !== item);
