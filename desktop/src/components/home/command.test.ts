import { describe, expect, it } from "vitest";
import type { ExamTarget } from "@/tauri/api";
import { commandFor, runCommand } from "./command";

const context = {
	certifications: ["cka", "ckad", "cks"],
	current: null as ExamTarget | null,
	today: "2026-11-01",
	defaultDate: "2026-12-31",
};
const current: ExamTarget = {
	certification: "cka",
	date: "2026-12-15",
	started: "2026-10-01",
	rest_days: [6],
};

describe("Home's kubectl", () => {
	it("sets a target, the day defaulted", () => {
		expect(runCommand("kubectl set exam CKA", context)).toEqual({
			kind: "set",
			target: { certification: "cka", date: "2026-12-31", rest_days: [], started: "2026-11-01" },
			output: 'exam "cka" created',
		});
	});

	it("reads the day and the rest days, either way flags are written", () => {
		const r = runCommand("kubectl set exam ckad --date=2027-01-20 --rest sat,Sunday", context);
		expect(r.kind === "set" && r.target).toMatchObject({ date: "2027-01-20", rest_days: [5, 6] });
	});

	it("changes a target, keeping what was left out and the first day", () => {
		const r = runCommand("kubectl set exam cks", { ...context, current });
		expect(r).toMatchObject({
			kind: "set",
			target: { certification: "cks", date: "2026-12-15", rest_days: [6], started: "2026-10-01" },
			output: 'exam "cks" configured',
		});
	});

	it("deletes the target, and gets it without doing anything", () => {
		expect(runCommand("kubectl delete exam", { ...context, current })).toEqual({
			kind: "delete",
			output: 'exam "cka" deleted',
		});
		expect(runCommand("kubectl delete exam", context).kind).toBe("error");
		expect(runCommand("kubectl get exam", context).kind).toBe("none");
		expect(runCommand("   ", context).kind).toBe("none");
	});

	it("says what is wrong, as kubectl would", () => {
		const output = (line: string) => {
			const r = runCommand(line, context);
			return r.kind === "error" ? r.output : r.kind;
		};
		expect(output("kubectl set exam")).toBe("error: which exam? cka, ckad, cks");
		expect(output("kubectl set exam lfcs")).toBe('error: no exam "lfcs", try cka, ckad, cks');
		expect(output("kubectl set exam cka --date 2026-10-01")).toBe(
			"error: 2026-10-01 is not after today"
		);
		expect(output("kubectl set exam cka --date soon")).toMatch(/YYYY-MM-DD/);
		expect(output("kubectl set exam cka --rest someday")).toMatch(/sat,sun/);
		expect(output("kubectl set exam cka --force")).toBe("error: unknown flag: --force");
		expect(output("kubectl set pod")).toMatch(/resource type "pod"/);
		expect(output("ls")).toMatch(/command not found/);
	});

	it("writes a target back as its command", () => {
		expect(commandFor(current)).toBe("kubectl set exam cka --date 2026-12-15 --rest sun");
		expect(runCommand(commandFor(current), { ...context, current }).kind).toBe("set");
	});
});
