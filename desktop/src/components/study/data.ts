import { addDays, dayKey, monday, streak } from "@/days";
import type { ExamReadiness, HistoryEntry } from "@/tauri/api";

/** When an attempt started (Unix ms), and its score */
export const startedAt = (h: HistoryEntry): number => h.result.started_at ?? 0;
export const scoreOf = (h: HistoryEntry): number => h.result.score ?? 0;

/** Each day's best score, by YYYY-MM-DD */
export function bestByDay(history: HistoryEntry[]): Map<string, number> {
	const best = new Map<string, number>();
	for (const h of history) {
		const day = dayKey(new Date(startedAt(h)));
		best.set(day, Math.max(best.get(day) ?? -1, scoreOf(h)));
	}
	return best;
}

/** The prep map's columns: Monday-first weeks from `start`'s week to `end`'s */
export function mapWeeks(start: Date, end: Date): Date[][] {
	const weeks: Date[][] = [];
	for (let day = monday(start); day <= end; day = addDays(day, 7))
		weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
	return weeks;
}

/** How a day's best score is drawn on the map: none, below the pass line, then by score */
export function level(score: number | undefined, pass: number): 0 | 1 | 2 | 3 | 4 {
	if (score === undefined) return 0;
	if (score < pass) return 1;
	return score < 75 ? 2 : score < 88 ? 3 : 4;
}

/** The figures beside the map */
export function studyFigures(history: HistoryEntry[], today: Date) {
	const days = new Set(history.map(h => dayKey(new Date(startedAt(h)))));
	const weeks = new Set([...days].map(d => dayKey(monday(new Date(`${d}T00:00`)))));
	return {
		days: days.size,
		streak: streak(days, today),
		weeks: weeks.size,
		attempts: history.length,
	};
}

/** A stretch of days (a week by default) in a few figures: days studied,
 * attempts, the best, exams passed for the first time */
export function weekRecap(history: HistoryEntry[], weekStart: Date, length = 7) {
	const from = weekStart.getTime();
	const to = addDays(weekStart, length).getTime();
	const before = history.filter(h => startedAt(h) < from);
	const week = history.filter(h => startedAt(h) >= from && startedAt(h) < to);
	const passedBefore = new Set(before.filter(h => h.result.passed).map(h => h.exam_id));
	const best = week.reduce<HistoryEntry | null>(
		(b, h) => (!b || scoreOf(h) > scoreOf(b) ? h : b),
		null
	);
	const firstPasses = [
		...new Set(week.filter(h => h.result.passed && !passedBefore.has(h.exam_id)).map(h => h.title)),
	];
	return {
		days: new Set(week.map(h => dayKey(new Date(startedAt(h))))).size,
		attempts: week.length,
		best: best && { title: best.title, score: scoreOf(best) },
		firstPasses,
	};
}

/** The weakest tested domain, by its share of points */
export function weakest(readiness: ExamReadiness | null) {
	const tested = (readiness?.domains ?? []).filter(d => d.max_points > 0);
	return tested.reduce<(typeof tested)[number] | null>(
		(w, d) => (!w || d.points / d.max_points < w.points / w.max_points ? d : w),
		null
	);
}

export interface Event {
	type: "Normal" | "Warning";
	reason: string;
	message: string;
}

/**
 * What stands out, as kubectl lists events: the latest attempt beating the
 * exam's best so far, and the domains under the pass line
 */
export function events(history: HistoryEntry[], readiness: ExamReadiness | null): Event[] {
	const out: Event[] = [];
	const [latest, ...older] = [...history].sort((a, b) => startedAt(b) - startedAt(a));
	if (latest) {
		const before = older.filter(h => h.exam_id === latest.exam_id).map(h => scoreOf(h));
		if (before.length && scoreOf(latest) > Math.max(...before))
			out.push({
				type: "Normal",
				reason: "NewBest",
				message: `${latest.title} ${Math.round(scoreOf(latest))}% (was ${Math.round(Math.max(...before))}%)`,
			});
	}
	for (const d of readiness?.domains ?? []) {
		if (!d.max_points) continue;
		const percent = (d.points * 100) / d.max_points;
		if (percent < (readiness?.pass_score ?? 66))
			out.push({
				type: "Warning",
				reason: "BelowPass",
				message: `${d.domain} ${Math.round(percent)}%`,
			});
	}
	return out;
}

/** Whole days from `today` to a YYYY-MM-DD day (0 on the day) */
export const daysUntil = (day: string, today: Date) =>
	Math.round(
		(new Date(`${day}T00:00`).getTime() -
			new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
			86_400_000
	);
