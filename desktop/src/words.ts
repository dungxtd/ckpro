/** How the app words things it counts and names, the same everywhere */

/** A curriculum domain's id as words (`services-networking` → `services networking`) */
export const domainName = (domain: string) => domain.replaceAll("-", " ");

/** A count with its noun: `1 worker`, `2 workers` */
export const plural = (n: number, word: string) => `${n} ${noun(n, word)}`;

/** The noun alone, for a count shown apart (a figure above its label) */
export const noun = (n: number, word: string) => `${word}${n === 1 ? "" : "s"}`;

/** Megabytes as gigabytes, one decimal: `2.1 GB` */
export const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;

/** Memory a container takes: megabytes under 1 GB (`48 MB`), else `gb` */
export const memory = (mb: number) => (mb < 1024 ? `${Math.round(mb)} MB` : gb(mb));

/** What stands for a value the app does not have (a score not graded, a
 * start not recorded), the same dash everywhere */
export const NONE = "–";

const sameDay = (a: Date, b: Date) =>
	a.getFullYear() === b.getFullYear() &&
	a.getMonth() === b.getMonth() &&
	a.getDate() === b.getDate();

/**
 * A moment the app shows (an attempt's start, a step's time), in the
 * candidate's locale: the time alone when it is today, else the date and
 * the time; `NONE` when there is none
 */
export function dateTime(ms: number | null | undefined, now = new Date()): string {
	if (ms === null || ms === undefined) return NONE;
	const d = new Date(ms);
	return sameDay(d, now)
		? d.toLocaleTimeString(undefined, { timeStyle: "short" })
		: d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
