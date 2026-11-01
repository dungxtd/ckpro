import { describe, expect, it } from "vitest";
import { byDay, dayKey, monthWeeks, parseMonth, streak } from "@/days";
import type { HistoryEntry } from "@/tauri/api";

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();
const entry = (id: string, started: number | null): HistoryEntry => ({
	attempt_id: id,
	exam_id: "cka-001",
	title: "Core Concepts",
	mode: "practice",
	pass_score: 66,
	result: {
		score: 70,
		passed: true,
		started_at: started,
		finished_at: started,
		questions: [],
		outside: [],
		assisted: [],
	},
});

describe("study calendar days", () => {
	it("lays a month out in six Monday-first weeks", () => {
		// October 2026 starts on a Thursday and ends on a Saturday
		const weeks = monthWeeks(new Date(2026, 9, 1));
		expect(weeks).toHaveLength(6);
		expect(weeks.every(w => w.length === 7)).toBe(true);
		expect(dayKey(weeks[0][0])).toBe("2026-09-28");
		expect(dayKey(weeks[5][6])).toBe("2026-11-08");
		// A month that fills six weeks itself is as tall
		expect(monthWeeks(new Date(2026, 10, 1))).toHaveLength(6);
	});

	it("reads only a YYYY-MM month", () => {
		expect(parseMonth("2026-02")?.getMonth()).toBe(1);
		expect(parseMonth("next")).toBeNull();
		expect(parseMonth(null)).toBeNull();
	});

	it("groups attempts by the day they started, untimed ones left out", () => {
		const days = byDay([
			entry("b", at(2026, 10, 30, 15)),
			entry("a", at(2026, 10, 30, 9)),
			entry("x", null),
		]);
		expect([...days.keys()]).toEqual(["2026-10-30"]);
		expect(days.get("2026-10-30")?.map(h => h.attempt_id)).toEqual(["a", "b"]);
	});

	it("counts the days in a row up to today, or to yesterday", () => {
		const days = new Set(["2026-10-28", "2026-10-29", "2026-10-30"]);
		expect(streak(days, new Date(2026, 9, 30))).toBe(3);
		expect(streak(days, new Date(2026, 9, 31))).toBe(3);
		expect(streak(days, new Date(2026, 10, 2))).toBe(0);
	});
});
