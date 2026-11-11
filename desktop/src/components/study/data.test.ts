import { describe, expect, it } from "vitest";
import { dayKey } from "@/days";
import type { ExamReadiness, ExamSummary, HistoryEntry } from "@/tauri/api";
import {
	activityLevel,
	bestByDay,
	daysUntil,
	events,
	freeDay,
	level,
	longestStreak,
	MAP_WEEKS,
	mapWeeks,
	minutesByDay,
	passed,
	predicted,
	retryList,
	scoreColor,
	studyFigures,
	suggestion,
	weakest,
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
	predict_at: 70,
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
		expect(events(all, null)).toEqual([
			{
				type: "Warning",
				reason: "NoPoints",
				message: "the last 2 attempts ended before any point",
			},
		]);
	});

	it("shows the score Rust predicts, none when it gives none", () => {
		expect(predicted({ ...readiness, predicted: null })).toBeNull();
		expect(predicted({ ...readiness, predicted: 70 })).toBe(70);
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

describe("the result's colour and next day", () => {
	it("colours a score by its tone against the pass line", () => {
		expect(scoreColor(0, 66)).toBe("var(--color-destructive)");
		expect(scoreColor(66, 66)).toBe("var(--color-success)");
		expect(scoreColor(100, 66)).toBe("var(--color-success)");
		// Under the pass line, not far: the warning's
		expect(scoreColor(50, 66)).toBe("var(--color-warning)");
	});
	it("picks the first day kept for study with nothing planned", () => {
		// Monday 9 November 2026; Tuesday has a plan, Wednesday is a rest day
		const from = new Date(2026, 10, 9);
		expect(dayKey(freeDay(from, [2], new Set(["2026-11-09", "2026-11-10"])) as Date)).toBe(
			"2026-11-12"
		);
		expect(freeDay(from, [0, 1, 2, 3, 4, 5, 6], new Set())).toBeNull();
	});
});

describe("the figures Home's modules show", () => {
	const timed = (id: string, day: number, from: number, to: number, checks: boolean[] = []) =>
		({
			...attempt(id, "core", day, 70),
			certification: "cka",
			result: {
				...attempt(id, "core", day, 70).result,
				started_at: new Date(2026, 9, day, from).getTime(),
				finished_at: new Date(2026, 9, day, to).getTime(),
				questions: [
					{
						id: "q1",
						title: "Fix a kubelet",
						points: 0,
						max_points: 1,
						checks: checks.map((passed, i) => ({ name: `c${i}`, weight: 1, passed, detail: "" })),
					},
				],
			},
		}) as HistoryEntry;

	it("adds up each day's minutes", () => {
		const minutes = minutesByDay([
			timed("a", 3, 9, 10),
			timed("b", 3, 20, 21),
			timed("c", 4, 9, 9),
		]);
		expect(minutes.get("2026-10-03")).toBe(120);
		// No time between start and end: nothing counted
		expect(minutes.has("2026-10-04")).toBe(false);
		expect([
			activityLevel(undefined),
			activityLevel(20),
			activityLevel(45),
			activityLevel(90),
			activityLevel(150),
		]).toEqual([0, 1, 2, 3, 4]);
	});

	it("finds the longest run of days", () => {
		expect(
			longestStreak([
				"2026-10-01",
				"2026-10-02",
				"2026-10-03",
				"2026-10-05",
				"2026-10-30",
				"2026-10-31",
				"2026-11-01",
			])
		).toBe(3);
		expect(longestStreak([])).toBe(0);
	});

	it("lists a question to retry as its latest try went", () => {
		// Failed on the 3rd, passed on the 5th: nothing to retry
		expect(
			retryList([timed("a", 3, 9, 10, [true, false]), timed("b", 5, 9, 10, [true, true])])
		).toEqual([]);
		// Passed first, failed later: retried, 1 of 2 checks failed
		const list = retryList([
			timed("a", 3, 9, 10, [true, true]),
			timed("b", 5, 9, 10, [false, true]),
		]);
		expect(list.map(r => [r.title, r.failed, r.checks, r.certification])).toEqual([
			["Fix a kubelet", 1, 2, "cka"],
		]);
	});

	it("counts the attempts passed and the best one", () => {
		const figures = passed(history);
		expect([figures.passed, figures.of, figures.best?.attempt_id]).toEqual([3, 5, "4"]);
	});
});
