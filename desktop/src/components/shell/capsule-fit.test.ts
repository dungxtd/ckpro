import { describe, expect, test } from "vitest";
import { dockWidth, fitCapsule, fitWidth, foldOrder, placeCapsule } from "./capsule-fit";

const m = { item: 28, gap: 2, pad: 4 };

describe("the capsule's fit", () => {
	test("names in full when they fit", () => {
		expect(fitCapsule(700, 9, 700, m)).toEqual({ mode: "full" });
	});
	test("an icon each when the names do not fit but the icons do", () => {
		expect(fitCapsule(700, 9, dockWidth(m, 9), m)).toEqual({ mode: "dock", shown: 9 });
	});
	test("folds the rest into a menu, keeping as many as fit", () => {
		const fit = fitCapsule(700, 9, dockWidth(m, 5), m);
		expect(fit).toEqual({ mode: "dock", shown: 4 });
		expect(fitWidth(fit, 700, 9, m)).toBe(dockWidth(m, 5));
	});
	test("always keeps the current one", () => {
		expect(fitCapsule(700, 9, 10, m)).toEqual({ mode: "dock", shown: 1 });
	});
});

describe("where the capsule goes", () => {
	test("centred in the window when that fits", () => {
		expect(placeCapsule(1200, 80, 1180, 600)).toBe(300);
	});
	test("only as far from the centre as an inspector needs", () => {
		// The inspector starts at 860: centred, the capsule would end at 900
		expect(placeCapsule(1200, 80, 860, 600)).toBe(260);
	});
	test("never over the window's buttons", () => {
		expect(placeCapsule(700, 80, 600, 600)).toBe(80);
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
