import { describe, expect, it } from "vitest";
import { daysBetween, daysUntil, readDay, relativeDay, streak, weekName, weekRange } from "@/days";

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

describe("days apart", () => {
	it("counts whole days, whatever the hour", () => {
		expect(daysUntil("2026-12-15", new Date(2026, 10, 1, 18))).toBe(44);
		expect(daysBetween("2026-11-14", "2026-11-10")).toBe(-4);
		// Across the change of clock time, still a day
		expect(daysBetween("2026-10-24", "2026-10-25")).toBe(1);
	});

	it("says a day against today", () => {
		const today = "2026-11-14";
		expect(relativeDay("2026-11-14", today)).toBe("today");
		expect(relativeDay("2026-11-15", today)).toBe("tomorrow");
		expect(relativeDay("2026-11-13", today)).toBe("yesterday");
		expect(relativeDay("2026-11-17", today)).toBe("in 3 days");
		expect(relativeDay("2026-11-10", today)).toBe("4 days ago");
	});

	it("names a week against today's", () => {
		const today = "2026-11-14";
		expect(weekName(new Date(2026, 10, 9), today)).toBe("This week");
		expect(weekName(new Date(2026, 10, 16), today)).toBe("Next week");
		expect(weekName(new Date(2026, 10, 2), today)).toBe("Last week");
		expect(weekName(new Date(2026, 10, 23), today)).toMatch(/^Week of /);
	});

	it("spans a week's days, one month or two", () => {
		expect(weekRange(new Date(2026, 10, 9))).toMatch(/^9 – .*15/);
		expect(weekRange(new Date(2026, 10, 30))).toMatch(/30.* – .*6/);
	});
});
