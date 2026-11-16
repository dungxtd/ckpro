import { describe, expect, it } from "vitest";
import { dayOf, shown } from "./date-field";

describe("a day typed in numbers", () => {
	it("puts the slashes in as the digits come", () => {
		expect(shown("2")).toBe("2");
		expect(shown("2003")).toBe("20/03");
		expect(shown("20032027")).toBe("20/03/2027");
	});
	it("reads eight digits as the day they make", () => {
		expect(dayOf("20032027")).toBe("2027-03-20");
		expect(dayOf("29022028")).toBe("2028-02-29");
	});
	it("says no to what is not a whole, real day", () => {
		expect(dayOf("2003")).toBeNull();
		expect(dayOf("31022027")).toBeNull();
		expect(dayOf("00012027")).toBeNull();
	});
});
