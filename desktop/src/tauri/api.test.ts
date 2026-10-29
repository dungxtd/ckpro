import { describe, expect, it } from "vitest";
import { ApiError, errorText } from "./api";

describe("errorText", () => {
	it("gives an app error's message, else the error itself", () => {
		expect(errorText(new ApiError({ code: "invalid", message: "no exam is running" }))).toBe(
			"no exam is running"
		);
		expect(errorText("plain")).toBe("plain");
	});
});
