import { describe, expect, it } from "vitest";
import { focus, percentOf } from "./domain-scores";

const domain = (name: string, weight: number, points: number, max: number) => ({
	domain: name,
	weight,
	points,
	max_points: max,
	questions: max ? 1 : 0,
});

describe("what to practise next", () => {
	it("picks the heaviest domains below passing, two at most", () => {
		const next = focus([
			domain("troubleshooting", 30, 5, 10),
			domain("workloads", 15, 1, 10),
			domain("storage", 10, 0, 0),
			domain("networking", 20, 9, 10),
		]);
		expect([...next]).toEqual(["troubleshooting", "workloads"]);
	});

	it("counts a domain not tested yet as one to practise", () => {
		expect(percentOf(domain("storage", 10, 0, 0))).toBeNull();
		expect([...focus([domain("storage", 10, 0, 0)])]).toEqual(["storage"]);
	});

	it("leaves out what passes", () => {
		expect(focus([domain("networking", 20, 7, 10)]).size).toBe(0);
	});
});
