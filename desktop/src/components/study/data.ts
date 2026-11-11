import { addDays, dayKey, monday, streak } from "@/days";
import type { ExamReadiness, ExamSummary, HistoryEntry } from "@/tauri/api";
import { domainName } from "@/words";

/** When an attempt started (Unix ms), and its score */
export const startedAt = (h: HistoryEntry): number => h.result.started_at ?? 0;
export const scoreOf = (h: HistoryEntry): number => h.result.score ?? 0;
/** An attempt ended before earning a point says nothing about the candidate:
 * it stays in History, and the study figures leave it out (as Rust does) */
export const worked = (h: HistoryEntry): boolean => scoreOf(h) > 0;

/** The predicted score: Rust gives one once enough of the exam is measured
 * (`predict_at`) */
export const predicted = (readiness: ExamReadiness | null): number | null =>
	readiness?.predicted ?? null;

/** Each day's best score, by YYYY-MM-DD (worked attempts only) */
export function bestByDay(history: HistoryEntry[]): Map<string, number> {
	const best = new Map<string, number>();
	for (const h of history.filter(worked)) {
		const day = dayKey(new Date(startedAt(h)));
		best.set(day, Math.max(best.get(day) ?? -1, scoreOf(h)));
	}
	return best;
}

/** The fewest weeks the prep map shows, so a new preparation is not two lone columns */
export const MAP_WEEKS = 12;

/** The prep map's columns: Monday-first weeks from `start`'s week to `end`'s,
 * `min` of them at least (reaching back before `start`) */
export function mapWeeks(start: Date, end: Date, min = MAP_WEEKS): Date[][] {
	const weeks: Date[][] = [];
	const earliest = addDays(monday(end), -7 * (min - 1));
	for (let day = monday(start < earliest ? start : earliest); day <= end; day = addDays(day, 7))
		weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
	return weeks;
}

/** A score's tone against the pass line: passing, near it, far under it */
export const scoreTone = (percent: number, pass: number) =>
	percent >= pass ? "success" : percent >= 40 ? "warning" : "destructive";

/**
 * A score's colour, as a CSS value: its tone's (`scoreTone`), one of three,
 * so a score reads the same as its badge and its bar wherever it shows.
 * The theme's tokens, so it follows light and dark
 */
export const scoreColor = (percent: number, pass: number): string =>
	`var(--color-${scoreTone(percent, pass)})`;

/** How a day's best score is drawn on the map: none, below the pass line, then by score */
export function level(score: number | undefined, pass: number): 0 | 1 | 2 | 3 | 4 {
	if (score === undefined) return 0;
	if (score < pass) return 1;
	return score < 75 ? 2 : score < 88 ? 3 : 4;
}

/** The figures beside the map (worked attempts only) */
export function studyFigures(all: HistoryEntry[], today: Date) {
	const history = all.filter(worked);
	const days = new Set(history.map(h => dayKey(new Date(startedAt(h)))));
	const weeks = new Set([...days].map(d => dayKey(monday(new Date(`${d}T00:00`)))));
	return {
		days: days.size,
		streak: streak(days, today),
		weeks: weeks.size,
		attempts: history.length,
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

/** Names in a short line: the first two, then how many more */
const listed = (names: string[]) =>
	names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more` : names.join(", ");

/**
 * What stands out, as kubectl lists events: the latest attempts ending
 * before any point, the latest one beating the exam's best so far, the
 * domains under the pass line (in one line) and those not measured yet
 */
export function events(history: HistoryEntry[], readiness: ExamReadiness | null): Event[] {
	const out: Event[] = [];
	const sorted = [...history].sort((a, b) => startedAt(b) - startedAt(a));
	const unscored = sorted.findIndex(worked);
	const ended = unscored === -1 ? sorted.length : unscored;
	if (ended > 0)
		out.push({
			type: "Warning",
			reason: "NoPoints",
			message:
				ended === 1
					? "the last attempt ended before any point"
					: `the last ${ended} attempts ended before any point`,
		});
	const [latest, ...older] = sorted.filter(worked);
	if (latest && latest === sorted[0]) {
		const before = older.filter(h => h.exam_id === latest.exam_id).map(h => scoreOf(h));
		if (before.length && scoreOf(latest) > Math.max(...before))
			out.push({
				type: "Normal",
				reason: "NewBest",
				message: `${latest.title} ${Math.round(scoreOf(latest))}% (was ${Math.round(Math.max(...before))}%)`,
			});
	}
	const domains = readiness?.domains ?? [];
	const pass = readiness?.pass_score ?? 66;
	const measured = domains.filter(d => d.max_points > 0);
	const below = measured
		.map(d => ({ d, percent: (d.points * 100) / d.max_points }))
		.filter(x => x.percent < pass);
	if (below.length)
		out.push({
			type: "Warning",
			reason: "BelowPass",
			message: `${below.length} domain${below.length === 1 ? "" : "s"} under ${pass}%: ${listed(below.map(x => `${domainName(x.d.domain)} ${Math.round(x.percent)}%`))}`,
		});
	const untested = domains.filter(d => !d.max_points);
	if (measured.length && untested.length)
		out.push({
			type: "Normal",
			reason: "NotMeasured",
			message: `${untested.length} domain${untested.length === 1 ? "" : "s"} not measured yet`,
		});
	return out;
}

/**
 * What to practise when nothing is planned, by rule: an exam of the
 * certification not worked yet (in the catalog's order), else the one with
 * the lowest best score
 */
export function suggestion(
	exams: ExamSummary[],
	history: HistoryEntry[],
	certification: string | null
): { exam: ExamSummary; reason: string } | null {
	const own = exams.filter(e => !certification || e.certification === certification);
	const best = new Map<string, number>();
	for (const h of history.filter(worked))
		best.set(h.exam_id, Math.max(best.get(h.exam_id) ?? 0, scoreOf(h)));
	const fresh = own.find(e => !best.has(e.id));
	if (fresh) return { exam: fresh, reason: "not tried yet" };
	const lowest = own.reduce<ExamSummary | null>(
		(low, e) => (!low || (best.get(e.id) ?? 0) < (best.get(low.id) ?? 0) ? e : low),
		null
	);
	return (
		lowest && { exam: lowest, reason: `your lowest best, ${Math.round(best.get(lowest.id) ?? 0)}%` }
	);
}

/** Whole days from `today` to a YYYY-MM-DD day (0 on the day) */
export const daysUntil = (day: string, today: Date) =>
	Math.round(
		(new Date(`${day}T00:00`).getTime() -
			new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
			86_400_000
	);

/** The first day from `from` the candidate keeps for study: not a rest day
 * (`rest`, 0 Monday to 6 Sunday) and nothing planned on it yet (`planned`,
 * YYYY-MM-DD); within two weeks, else none */
export function freeDay(from: Date, rest: number[], planned: Set<string>): Date | null {
	for (let i = 0; i < 14; i++) {
		const day = addDays(from, i);
		if (!rest.includes((day.getDay() + 6) % 7) && !planned.has(dayKey(day))) return day;
	}
	return null;
}

/** Minutes practised each day, by YYYY-MM-DD: every attempt's time, from its
 * start to its end (worked or not: the time was spent) */
export function minutesByDay(history: HistoryEntry[]): Map<string, number> {
	const minutes = new Map<string, number>();
	for (const h of history) {
		const from = startedAt(h);
		const to = h.result.finished_at ?? from;
		if (!from || to <= from) continue;
		const day = dayKey(new Date(from));
		minutes.set(day, (minutes.get(day) ?? 0) + Math.round((to - from) / 60_000));
	}
	return minutes;
}

/** How much a day's practice weighs on the activity map: none, then up to
 * an hour and a half and more */
export function activityLevel(minutes: number | undefined): 0 | 1 | 2 | 3 | 4 {
	if (!minutes) return 0;
	return minutes < 30 ? 1 : minutes < 60 ? 2 : minutes < 100 ? 3 : 4;
}

/** The most days in a row with an attempt */
export function longestStreak(days: Iterable<string>): number {
	const sorted = [...new Set(days)].sort();
	let best = 0;
	let run = 0;
	let last: Date | null = null;
	for (const key of sorted) {
		const day = new Date(`${key}T00:00`);
		run = last && dayKey(addDays(last, 1)) === key ? run + 1 : 1;
		best = Math.max(best, run);
		last = day;
	}
	return best;
}

/** A question to try again: its latest try failed checks */
export type Retry = {
	id: string;
	title: string;
	certification: string;
	examId: string;
	failed: number;
	checks: number;
	/** When that try started (Unix ms) */
	at: number;
};

/** The questions whose latest try failed one check or more, latest first.
 * Each question once, as it last went (a later pass takes it off) */
export function retryList(history: HistoryEntry[]): Retry[] {
	const seen = new Set<string>();
	const list: Retry[] = [];
	for (const h of [...history].sort((a, b) => startedAt(b) - startedAt(a))) {
		for (const q of h.result.questions ?? []) {
			if (seen.has(q.id)) continue;
			seen.add(q.id);
			const failed = q.checks.filter(c => !c.passed).length;
			if (failed > 0)
				list.push({
					id: q.id,
					title: q.title,
					certification: h.certification ?? "",
					examId: h.exam_id,
					failed,
					checks: q.checks.length,
					at: startedAt(h),
				});
		}
	}
	return list;
}

/** Attempts passed, and of how many (worked ones only) */
export function passed(history: HistoryEntry[]) {
	const counted = history.filter(worked);
	const best = counted.reduce<HistoryEntry | null>(
		(b, h) => (!b || scoreOf(h) > scoreOf(b) ? h : b),
		null
	);
	return { passed: counted.filter(h => h.result.passed).length, of: counted.length, best };
}
