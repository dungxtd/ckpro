import { describe, expect, it } from "vitest";
import { certName, dateTime, NONE, shortDay, startLabel } from "@/words";

describe("words", () => {
	it("writes a certification in capitals", () => {
		expect(certName("cka")).toBe("CKA");
	});

	it("says what starts an exam in a mode", () => {
		expect(startLabel("exam")).toBe("Start exam");
		expect(startLabel("practice")).toBe("Start practice");
	});

	it("writes a day short, with its weekday and month", () => {
		const day = shortDay(new Date(2026, 10, 14));
		expect(day).toMatch(/14/);
		expect(day).not.toMatch(/2026/);
	});
});

describe("dateTime", () => {
	it("always says the day: today by name, another with its date", () => {
		const now = new Date(2026, 10, 14, 18, 0);
		expect(dateTime(new Date(2026, 10, 14, 9, 5).getTime(), now)).toMatch(/^Today, /);
		expect(dateTime(new Date(2026, 10, 12, 9, 5).getTime(), now)).toMatch(/2026/);
		expect(dateTime(null, now)).toBe(NONE);
	});
});
