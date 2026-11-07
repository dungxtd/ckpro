import { describe, expect, test } from "vitest";
import { dockWidth, fitCapsule, foldOrder } from "./capsule-fit";

const m = { item: 28, gap: 2, pad: 4 };

describe("the capsule's fit", () => {
	test("names in full when they fit", () => {
		expect(fitCapsule(700, 9, 700, m)).toEqual({ mode: "full" });
	});
	test("an icon each when the names do not fit but the icons do", () => {
		expect(fitCapsule(700, 9, dockWidth(m, 9), m)).toEqual({ mode: "dock", shown: 9 });
	});
	test("folds the rest into a menu, keeping as many as fit", () => {
		expect(fitCapsule(700, 9, dockWidth(m, 5), m)).toEqual({ mode: "dock", shown: 4 });
	});
	test("always keeps the current one", () => {
		expect(fitCapsule(700, 9, 10, m)).toEqual({ mode: "dock", shown: 1 });
	});
});

test("search folds first, the sidebar's button last, the current screen never", () => {
	const keys = [
		"sidebar",
		"/",
		"/calendar",
		"/create",
		"/history",
		"/exams",
		"/settings",
		"search",
	];
	expect(foldOrder(keys, "/create")).toEqual([
		"search",
		"/settings",
		"/exams",
		"/history",
		"/calendar",
		"/",
		"sidebar",
	]);
});
