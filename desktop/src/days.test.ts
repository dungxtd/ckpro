import { describe, expect, it } from "vitest";
import { streak } from "@/days";

describe("study calendar days", () => {
	it("counts the days in a row up to today, or to yesterday", () => {
		const days = new Set(["2026-10-28", "2026-10-29", "2026-10-30"]);
		expect(streak(days, new Date(2026, 9, 30))).toBe(3);
		expect(streak(days, new Date(2026, 9, 31))).toBe(3);
		expect(streak(days, new Date(2026, 10, 2))).toBe(0);
	});
});
