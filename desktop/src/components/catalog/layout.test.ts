import { describe, expect, it } from "vitest";
import { examStats } from "@/stores/study";
import type { ExamSummary, HistoryEntry, SidebarLayout } from "@/tauri/api";
import { arrange, moved, pinned, stepped, toggled } from "./layout";

const exam = (id: string, certification: string, title = id) =>
	({ id, certification, title }) as ExamSummary;
const none: SidebarLayout = {
	groups: [],
	exams: [],
	collapsed: [],
	hidden: [],
	screens: [],
	hidden_screens: [],
	pinned: [],
	sort: {},
};
const catalog = [
	exam("s1", "cks"),
	exam("a1", "cka", "Core"),
	exam("a2", "cka", "Advanced"),
	exam("d1", "ckad"),
	exam("a3", "cka", "Scenarios"),
];
const ids = (layout: SidebarLayout, withHidden = false, stats = new Map()) =>
	arrange(catalog, layout, withHidden, stats).map(g => [g.cert, g.exams.map(e => e.id)]);
const attempt = (exam_id: string, started_at: number, score: number) =>
	({ exam_id, result: { started_at, score } }) as HistoryEntry;

describe("sidebar layout", () => {
	it("lists the certifications in the order they are taken, the exams as they come", () => {
		expect(ids(none)).toEqual([
			["cka", ["a1", "a2", "a3"]],
			["ckad", ["d1"]],
			["cks", ["s1"]],
		]);
	});

	it("puts what was dragged first, the rest after", () => {
		expect(ids({ ...none, groups: ["cks"], exams: ["a3", "a1"] })).toEqual([
			["cks", ["s1"]],
			["cka", ["a3", "a1", "a2"]],
			["ckad", ["d1"]],
		]);
	});

	it("leaves hidden certifications out, unless asked for them, and says which are folded", () => {
		const layout = { ...none, hidden: ["ckad"], collapsed: ["cka"] };
		expect(ids(layout).map(([cert]) => cert)).toEqual(["cka", "cks"]);
		expect(ids(layout, true).map(([cert]) => cert)).toEqual(["cka", "ckad", "cks"]);
		expect(arrange(catalog, layout)[0].collapsed).toBe(true);
	});

	it("lists pinned exams above, in their order, and out of their certification", () => {
		const layout = { ...none, pinned: ["a3", "gone", "s1"] };
		expect(pinned(catalog, layout).map(e => e.id)).toEqual(["a3", "s1"]);
		expect(ids(layout)).toEqual([
			["cka", ["a1", "a2"]],
			["ckad", ["d1"]],
			["cks", []],
		]);
	});

	it("sorts a certification by name, by recent practice, or lowest score first", () => {
		const stats = examStats([attempt("a1", 10, 90), attempt("a2", 30, 50), attempt("a1", 20, 70)]);
		expect(stats.get("a1")).toEqual({ last: 20, score: 70 });
		const cka = (sort: "name" | "recent" | "score") =>
			ids({ ...none, sort: { cka: sort } }, false, stats)[0][1];
		expect(cka("name")).toEqual(["a2", "a1", "a3"]);
		expect(cka("recent")).toEqual(["a2", "a1", "a3"]);
		// Never practised first: it needs it most
		expect(cka("score")).toEqual(["a3", "a2", "a1"]);
	});

	it("moves, steps and toggles items in a list", () => {
		expect(moved(["a", "b", "c"], "c", "a", false)).toEqual(["c", "a", "b"]);
		expect(moved(["a", "b", "c"], "a", "c", true)).toEqual(["b", "c", "a"]);
		expect(moved(["a", "b"], "a", "a", true)).toEqual(["a", "b"]);
		expect(stepped(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
		expect(stepped(["a", "b"], "a", -1)).toEqual(["a", "b"]);
		expect(toggled(["a"], "b", true)).toEqual(["a", "b"]);
		expect(toggled(["a", "b"], "a", false)).toEqual(["b"]);
	});
});
