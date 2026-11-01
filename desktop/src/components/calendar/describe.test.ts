import { expect, it, describe as suite } from "vitest";
import type { HistoryEntry, PlanView } from "@/tauri/api";
import { describe } from "./describe";

const at = (d: number, h = 10) => new Date(2026, 9, d, h).getTime();
const attempt = (exam: string, day: number, score: number) =>
	({
		attempt_id: `${exam}${day}`,
		exam_id: exam,
		title: exam,
		mode: "practice",
		pass_score: 66,
		result: {
			score,
			passed: score >= 66,
			started_at: at(day),
			finished_at: at(day, 11),
			questions: [],
			outside: [],
			assisted: [],
		},
	}) as HistoryEntry;
const plan = (day: string, done: number | null) =>
	({
		id: 1,
		day,
		exam_id: "lab",
		title: "Lab",
		certification: "cka",
		mode: "exam",
		done,
	}) as PlanView;
const text = (lines: ReturnType<typeof describe>) =>
	lines.map(l => l.map(p => p[0]).join("")).join("\n");

suite("kubectl describe day", () => {
	it("lists the attempts, a new best and a score below the pass line", () => {
		const out = text(
			describe(
				"2026-10-29",
				[attempt("core", 12, 72), attempt("core", 29, 94), attempt("sec", 29, 49)],
				[],
				"2026-11-01"
			)
		);
		expect(out).toContain("Attempts:  2 Completed");
		expect(out).toContain("NewBest  core 94% (was 72%)");
		expect(out).toContain("Below    sec 49%, plan a retry");
		expect(out).toContain("Plans:     <none>");
	});

	it("tells a pending plan from a missed one", () => {
		expect(text(describe("2026-11-05", [], [plan("2026-11-05", null)], "2026-11-01"))).toContain(
			"Plans:     1 Pending"
		);
		expect(text(describe("2026-10-30", [], [plan("2026-10-30", null)], "2026-11-01"))).toContain(
			"Plans:     1 Missed"
		);
		expect(text(describe("2026-10-30", [], [plan("2026-10-30", 80)], "2026-11-01"))).toContain(
			"Plans:     <none>"
		);
	});
});
