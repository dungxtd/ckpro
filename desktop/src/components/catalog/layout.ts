import type { ExamSummary, SidebarLayout } from "@/tauri/api";

const CERT_ORDER = ["cka", "ckad", "cks"];

/** Where `key` falls in `order`: its place there, or after every placed one
 * (then in its `fallback` place) */
const rank = (order: string[], key: string, fallback: number) => {
	const i = order.indexOf(key);
	return i >= 0 ? i : order.length + fallback;
};

export interface Group {
	cert: string;
	exams: ExamSummary[];
	collapsed: boolean;
}

/**
 * The exams by certification as the sidebar lists them: certifications and
 * exams in the order the candidate dragged them (the rest after, as they
 * come), hidden certifications left out unless `withHidden`
 */
export function arrange(
	catalog: ExamSummary[],
	layout: SidebarLayout,
	withHidden = false
): Group[] {
	const certs = [...new Set(catalog.map(e => e.certification))];
	const fallback = (c: string) => {
		const i = CERT_ORDER.indexOf(c);
		return i >= 0 ? i : CERT_ORDER.length + certs.indexOf(c);
	};
	return certs
		.filter(c => withHidden || !layout.hidden.includes(c))
		.sort((a, b) => rank(layout.groups, a, fallback(a)) - rank(layout.groups, b, fallback(b)))
		.map(cert => ({
			cert,
			collapsed: layout.collapsed.includes(cert),
			exams: catalog
				.filter(e => e.certification === cert)
				.map((e, i) => [e, rank(layout.exams, e.id, i)] as const)
				.sort((a, b) => a[1] - b[1])
				.map(([e]) => e),
		}));
}

/** `list` with `item` moved to just before or after `target` */
export function moved(list: string[], item: string, target: string, after: boolean): string[] {
	if (item === target) return list;
	const rest = list.filter(x => x !== item);
	const at = rest.indexOf(target);
	if (at < 0) return list;
	rest.splice(after ? at + 1 : at, 0, item);
	return rest;
}

/** `list` with `item` in it, or out of it */
export const toggled = (list: string[], item: string, on: boolean) =>
	on ? [...new Set([...list, item])] : list.filter(x => x !== item);
