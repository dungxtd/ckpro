import { describe, expect, it } from "vitest";
import { dayKey } from "@/days";
import type { ExamReadiness, ExamSummary, HistoryEntry } from "@/tauri/api";
import {
	bestByDay,
	daysUntil,
	events,
	level,
	MAP_WEEKS,
	mapWeeks,
	predicted,
	studyFigures,
	suggestion,
	weakest,
	weekRecap,
} from "./data";

const at = (d: number, h = 10) => new Date(2026, 9, d, h).getTime();
const attempt = (
	id: string,
	exam: string,
	day: number,
	score: number,
	title = exam
): HistoryEntry =>
	({
		attempt_id: id,
		exam_id: exam,
		title,
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
const history = [
	attempt("1", "core", 12, 72, "Core"),
	attempt("2", "helm", 27, 81, "Helm"),
	attempt("3", "core", 29, 49, "Core"),
	attempt("4", "core", 30, 94, "Core"),
	attempt("5", "lab", 30, 61, "Lab"),
];
const readiness = {
	certification: "cka",
	title: "CKA",
	pass_score: 66,
	predicted: 70,
	coverage: 60,
	window_days: 30,
	domains: [
		{ domain: "troubleshooting", weight: 30, points: 8, max_points: 10, questions: 1 },
		{ domain: "storage", weight: 10, points: 4, max_points: 10, questions: 1 },
		{ domain: "workloads", weight: 15, points: 0, max_points: 0, questions: 0 },
	],
} as ExamReadiness;

describe("home figures", () => {
	it("keeps each day's best score", () => {
		expect(bestByDay(history).get(dayKey(new Date(at(30))))).toBe(94);
	});

	it("lays the map out in Monday-first weeks to the end's week", () => {
		const weeks = mapWeeks(new Date(2026, 8, 9), new Date(2026, 11, 15));
		expect(dayKey(weeks[0][0])).toBe("2026-09-07");
		expect(dayKey(weeks.at(-1)?.[0] as Date)).toBe("2026-12-14");
		expect(weeks.every(w => w.length === 7)).toBe(true);
	});

	it("shows a few weeks at least, reaching back before a new start", () => {
		const weeks = mapWeeks(new Date(2026, 9, 28), new Date(2026, 10, 1));
		expect(weeks).toHaveLength(MAP_WEEKS);
		expect(dayKey(weeks.at(-1)?.[0] as Date)).toBe("2026-10-26");
	});

	it("draws a score below the pass line apart from passing ones", () => {
		expect([
			level(undefined, 66),
			level(50, 66),
			level(70, 66),
			level(80, 66),
			level(95, 66),
		]).toEqual([0, 1, 2, 3, 4]);
	});

	it("counts days, the run up to today, weeks and attempts", () => {
		expect(studyFigures(history, new Date(2026, 9, 30))).toEqual({
			days: 4,
			streak: 2,
			weeks: 2,
			attempts: 5,
		});
	});

	it("sums a week up, with the exams passed for the first time", () => {
		const recap = weekRecap(history, new Date(2026, 9, 26));
		expect(recap).toEqual({
			days: 3,
			attempts: 4,
			best: { title: "Core", score: 94 },
			firstPasses: ["Helm"],
		});
	});

	it("names the weakest tested domain", () => {
		expect(weakest(readiness)?.domain).toBe("storage");
		expect(weakest(null)).toBeNull();
	});

	it("lists a new best, the domains below the pass line and those not measured", () => {
		expect(events(history, readiness)).toEqual([
			{ type: "Normal", reason: "NewBest", message: "Core 94% (was 72%)" },
			{ type: "Warning", reason: "BelowPass", message: "1 domain under 66%: storage 40%" },
			{ type: "Normal", reason: "NotMeasured", message: "1 domain not measured yet" },
		]);
	});

	it("leaves out attempts ended before any point, and says so", () => {
		const ended = [attempt("6", "core", 31, 0, "Core"), attempt("7", "core", 31, 0, "Core")];
		const all = [...ended, ...history];
		expect(studyFigures(all, new Date(2026, 9, 31)).attempts).toBe(5);
		expect(bestByDay(all).has(dayKey(new Date(at(31))))).toBe(false);
		expect(weekRecap(ended, new Date(2026, 9, 26))).toEqual({
			days: 0,
			attempts: 0,
			best: null,
			firstPasses: [],
		});
		expect(events(all, null)).toEqual([
			{
				type: "Warning",
				reason: "NoPoints",
				message: "the last 2 attempts ended before any point",
			},
		]);
	});

	it("predicts a score only once most of the exam is measured", () => {
		expect(predicted(readiness)).toBeNull();
		expect(predicted({ ...readiness, coverage: 75 })).toBe(70);
		expect(predicted(null)).toBeNull();
	});

	it("suggests an exam not tried yet, else the lowest best", () => {
		const exam = (id: string, certification = "cka") => ({ id, certification }) as ExamSummary;
		const exams = [exam("core"), exam("helm"), exam("lab"), exam("app", "ckad")];
		expect(suggestion(exams, history, "ckad")?.exam.id).toBe("app");
		expect(suggestion(exams, history, "cka")).toEqual({
			exam: exams[2],
			reason: "your lowest best, 61%",
		});
		expect(suggestion([...exams, exam("new")], history, "cka")?.reason).toBe("not tried yet");
		expect(suggestion([], history, null)).toBeNull();
	});

	it("counts the days to the exam", () => {
		expect(daysUntil("2026-12-15", new Date(2026, 10, 1, 18))).toBe(44);
	});
});
