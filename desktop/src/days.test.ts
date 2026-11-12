import { describe, expect, it } from "vitest";
import { readDay, streak } from "@/days";

describe("study calendar days", () => {
	it("counts the days in a row up to today, or to yesterday", () => {
		const days = new Set(["2026-10-28", "2026-10-29", "2026-10-30"]);
		expect(streak(days, new Date(2026, 9, 30))).toBe(3);
		expect(streak(days, new Date(2026, 9, 31))).toBe(3);
		expect(streak(days, new Date(2026, 10, 2))).toBe(0);
	});
});

describe("a day as typed", () => {
	const today = new Date(2026, 10, 12);
	it("reads the usual ways of writing a day", () => {
		expect(readDay("2027-01-31", today)).toBe("2027-01-31");
		expect(readDay("31/1/2027", today)).toBe("2027-01-31");
		expect(readDay("31.01.27", today)).toBe("2027-01-31");
		expect(readDay("Jan 31 2027", today)).toBe("2027-01-31");
		expect(readDay("31 jan", today)).toBe("2027-01-31");
		// Without a year: the next one, this year when it is still ahead
		expect(readDay("20/12", today)).toBe("2026-12-20");
	});
	it("says no to what is not a day", () => {
		expect(readDay("31/2/2027", today)).toBeNull();
		expect(readDay("soon", today)).toBeNull();
		expect(readDay("", today)).toBeNull();
	});
});
