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
