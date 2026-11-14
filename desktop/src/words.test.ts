import { describe, expect, it } from "vitest";
import { certName, shortDay, startLabel } from "@/words";

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
