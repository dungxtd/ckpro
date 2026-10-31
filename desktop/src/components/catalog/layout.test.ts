import { describe, expect, it } from "vitest";
import type { ExamSummary, SidebarLayout } from "@/tauri/api";
import { arrange, moved, stepped, toggled } from "./layout";

const exam = (id: string, certification: string) => ({ id, certification }) as ExamSummary;
const none: SidebarLayout = { groups: [], exams: [], collapsed: [], hidden: [] };
const catalog = [
	exam("s1", "cks"),
	exam("a1", "cka"),
	exam("a2", "cka"),
	exam("d1", "ckad"),
	exam("a3", "cka"),
];
const ids = (layout: SidebarLayout, withHidden = false) =>
	arrange(catalog, layout, withHidden).map(g => [g.cert, g.exams.map(e => e.id)]);

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
