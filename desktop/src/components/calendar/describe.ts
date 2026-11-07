import { scoreOf, startedAt } from "@/components/study/data";
import type { HistoryEntry, PlanView } from "@/tauri/api";

/** One line of `kubectl describe day`, in parts of a tone */
export type Part = [text: string, tone?: "command" | "muted" | "ok" | "warn" | "note"];
export type Line = Part[];

/**
 * A day as kubectl describes a resource: its attempts (passed or below the
 * pass line), its plans (pending, or missed once the day is over) and the
 * events that stood out (a new best, a score below the pass line)
 */
export function describe(
	day: string,
	history: HistoryEntry[],
	plans: PlanView[],
	today: string
): Line[] {
	const start = new Date(`${day}T00:00`).getTime();
	const end = start + 86_400_000;
	const onDay = history.filter(h => startedAt(h) >= start && startedAt(h) < end);
	const before = history.filter(h => startedAt(h) < start);
	const mine = plans.filter(p => p.day === day);
	const open = mine.filter(p => p.done === null);
	const lines: Line[] = [[[`kubectl describe day ${day}`, "command"]]];
	lines.push([
		["Attempts:  "],
		onDay.length ? [`${onDay.length} Completed`, "ok"] : ["<none>", "muted"],
	]);
	for (const h of onDay) {
		const passed = scoreOf(h) >= h.pass_score;
		lines.push([
			[`  ${h.title.padEnd(34)} `],
			[
				`${Math.round(scoreOf(h))}%  ${passed ? "Passed" : "Below pass line"}`,
				passed ? "ok" : "warn",
			],
		]);
	}
	const missed = day < today;
	lines.push([
		["Plans:     "],
		open.length
			? [`${open.length} ${missed ? "Missed" : "Pending"}`, missed ? "warn" : "note"]
			: ["<none>", "muted"],
	]);
	for (const p of open) lines.push([[`  ${p.title} `], [`(${p.mode})`, "muted"]]);
	const events: Line[] = [];
	for (const h of onDay) {
		const prior = before.filter(b => b.exam_id === h.exam_id).map(scoreOf);
		if (prior.length && scoreOf(h) > Math.max(...prior))
			events.push([
				["  "],
				["Normal ", "ok"],
				[
					`  NewBest  ${h.title} ${Math.round(scoreOf(h))}% (was ${Math.round(Math.max(...prior))}%)`,
				],
			]);
		if (scoreOf(h) < h.pass_score)
			events.push([
				["  "],
				["Warning", "warn"],
				[`  Below    ${h.title} ${Math.round(scoreOf(h))}%, plan a retry`],
			]);
	}
	lines.push([["Events:    "], ...(events.length ? [] : [["<none>", "muted"] as Part])]);
	lines.push(...events);
	return lines;
}
