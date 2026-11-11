import { describe, expect, it } from "vitest";
import { arrange, type ModuleSize, reading, settle, toSaved } from "./layout";

const sizes: Record<string, ModuleSize> = { a: "l", b: "w", c: "s", d: "s", e: "x" };
const sizeOf = (id: string) => sizes[id];

describe("Home's module places", () => {
	it("pushes down what a module is moved onto, and only that", () => {
		// a 2×2 at the left, b wide at the right, c and d small under b
		const places = { a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, c: { x: 2, y: 1 }, d: { x: 3, y: 1 } };
		// c moved onto b's cell: b goes down a row, and d, under it then, one more
		const moved = settle({ ...places, c: { x: 2, y: 0 } }, sizeOf, "c");
		expect(moved.c).toEqual({ x: 2, y: 0 });
		expect(moved.b).toEqual({ x: 2, y: 1 });
		expect(moved.d).toEqual({ x: 3, y: 2 });
		// Nothing it did not cover moves
		expect(moved.a).toEqual({ x: 0, y: 0 });
	});

	it("closes a row left empty, and keeps the gaps beside modules", () => {
		const places = settle({ a: { x: 0, y: 0 }, c: { x: 3, y: 5 } }, sizeOf);
		expect(places.c).toEqual({ x: 3, y: 2 });
		// The empty cells beside a stay empty
		expect(places.a).toEqual({ x: 0, y: 0 });
	});

	it("keeps a module inside the grid", () => {
		expect(settle({ e: { x: 3, y: 0 } }, sizeOf).e).toEqual({ x: 1, y: 0 });
	});

	it("follows the default until arranged, then the candidate's places", () => {
		const defaults = { a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, c: { x: 2, y: 1 } };
		const fresh = { places: [], hidden: [], custom: false };
		// A module not shown (AI off) leaves the others where the default puts them
		expect(arrange(fresh, ["a", "c"], defaults, sizeOf)).toEqual({
			a: { x: 0, y: 0 },
			c: { x: 2, y: 1 },
		});
		const saved = toSaved({ a: { x: 2, y: 0 }, c: { x: 0, y: 0 } }, ["b"], fresh);
		expect(saved.custom).toBe(true);
		// Theirs; b hidden; d new since, at the bottom
		const places = arrange(saved, ["a", "b", "c", "d"], defaults, sizeOf);
		expect(places).toEqual({ a: { x: 2, y: 0 }, c: { x: 0, y: 0 }, d: { x: 0, y: 2 } });
		expect(reading(places)).toEqual(["c", "a", "d"]);
	});
});
