import type { HistoryEntry } from "@/tauri/api";

/** A day as `YYYY-MM-DD`, in local time */
export const dayKey = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A month as `YYYY-MM` */
export const monthKey = (d: Date) => dayKey(d).slice(0, 7);

/** The first day of a `YYYY-MM` month; null when it is not one */
export function parseMonth(key: string | null): Date | null {
	const m = key?.match(/^(\d{4})-(\d{2})$/);
	return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : null;
}

/** The weeks a month's grid shows, Monday first, from the week of the 1st
 * to the week of its last day */
export function monthWeeks(month: Date): Date[][] {
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const start = new Date(first);
	start.setDate(1 - ((first.getDay() + 6) % 7));
	const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
	const weeks: Date[][] = [];
	for (const day = new Date(start); day <= last || weeks.at(-1)?.length !== 7; ) {
		if (!weeks.length || weeks.at(-1)?.length === 7) weeks.push([]);
		weeks.at(-1)?.push(new Date(day));
		day.setDate(day.getDate() + 1);
	}
	return weeks;
}

/** Finished attempts by the day they started, each day's in order */
export function byDay(history: HistoryEntry[]): Map<string, HistoryEntry[]> {
	const days = new Map<string, HistoryEntry[]>();
	const timed = history.filter(h => h.result.started_at !== null);
	timed.sort((a, b) => (a.result.started_at ?? 0) - (b.result.started_at ?? 0));
	for (const h of timed) {
		const key = dayKey(new Date(h.result.started_at ?? 0));
		days.set(key, [...(days.get(key) ?? []), h]);
	}
	return days;
}

/** Days in a row with an attempt, up to today (or yesterday, when today
 * has none yet) */
export function streak(days: Set<string>, today: Date): number {
	const day = new Date(today);
	if (!days.has(dayKey(day))) day.setDate(day.getDate() - 1);
	let n = 0;
	while (days.has(dayKey(day))) {
		n++;
		day.setDate(day.getDate() - 1);
	}
	return n;
}
