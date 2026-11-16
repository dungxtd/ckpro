/** A day's length in milliseconds (days here are calendar days: a
 * difference is rounded, so a change of clock time does not count) */
export const DAY_MS = 86_400_000;

/** A day as `YYYY-MM-DD`, in local time */
export const dayKey = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** `d` moved by `n` days (a new date) */
export const addDays = (d: Date, n: number) => {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
};

/** The Monday of `d`'s week (a new date, at midnight) */
export const monday = (d: Date) => {
	const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	return addDays(x, -((x.getDay() + 6) % 7));
};

/** A YYYY-MM-DD day as a date, at midnight in the candidate's time */
export const parseDay = (key: string) => new Date(`${key}T00:00`);

/** Whole days from `from` to `to` (YYYY-MM-DD days), negative when `to`
 * comes first */
export const daysBetween = (from: string, to: string) =>
	Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS);

/** Whole days from `today` to a YYYY-MM-DD day (0 on the day) */
export const daysUntil = (day: string, today: Date) => daysBetween(dayKey(today), day);

/** A day against today, in words: today, tomorrow, yesterday, in 3 days, 3
 * days ago */
export function relativeDay(day: string, today: string): string {
	const n = daysBetween(today, day);
	if (n === 0) return "today";
	if (n === 1) return "tomorrow";
	if (n === -1) return "yesterday";
	return n < 0 ? `${-n} days ago` : `in ${n} days`;
}

/** A week's name against today's: this, next or last week, else the week
 * of its Monday (`week`) */
export function weekName(week: Date, today: string): string {
	const weeks = Math.round(daysBetween(dayKey(monday(parseDay(today))), dayKey(week)) / 7);
	if (weeks === 0) return "This week";
	if (weeks === 1) return "Next week";
	if (weeks === -1) return "Last week";
	return `Week of ${week.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`;
}

/** A week's days from its Monday: `9 – 15 November`, or `30 Nov – 6 Dec`
 * across two months */
export function weekRange(week: Date): string {
	const end = addDays(week, 6);
	// The locale's own range ("9 – 15 November", "November 9 – 15"); the
	// month in full when one month holds the week
	const month = week.getMonth() === end.getMonth() ? "long" : "short";
	return new Intl.DateTimeFormat(undefined, { day: "numeric", month }).formatRange(week, end);
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
