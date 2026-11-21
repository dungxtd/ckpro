import { describe, expect, it } from "vitest";
import { along, body, cut, gone, gripAt, step, type World } from "./ticket-physics";

const world = (over: Partial<World> = {}): World => ({
	width: 1200,
	height: 800,
	top: 44,
	floor: true,
	sides: true,
	...over,
});

/** `seconds` of steps, as the component runs them (8 a frame at 60 fps) */
const run = (b: ReturnType<typeof body>, w: World, seconds: number, grip = null as never) => {
	let landed = 0;
	for (let i = 0; i < seconds * 480; i++) landed = Math.max(landed, step(b, w, 1 / 480, grip));
	return landed;
};

describe("ticket physics", () => {
	it("falls and comes to rest on the floor, struck hard on the way", () => {
		const b = body(380, 116, 600, 120);
		b.w = 2;
		const landed = run(b, world(), 4);
		expect(landed).toBeGreaterThan(500);
		expect(Math.abs(b.vy)).toBeLessThan(30);
		expect(b.y).toBeGreaterThan(800 - 200);
		expect(b.y).toBeLessThan(800);
	});

	it("stays inside the sides", () => {
		const b = body(380, 116, 600, 300);
		b.vx = 4000;
		run(b, world(), 3);
		expect(b.x).toBeLessThan(1200);
		expect(b.x).toBeGreaterThan(0);
	});

	it("held, follows the pointer and keeps its angle", () => {
		const b = body(380, 116, 600, 300);
		b.a = 0.3;
		const g = gripAt(b, 500, 300);
		g.px = 300;
		g.py = 200;
		for (let i = 0; i < 960; i++) step(b, world(), 1 / 480, g);
		expect(b.a).toBeCloseTo(0.3, 5);
		const c = Math.cos(b.a);
		const s = Math.sin(b.a);
		expect(b.x + g.lx * c - g.ly * s).toBeCloseTo(300, -1);
	});

	it("without a floor, falls out of the window", () => {
		const b = body(380, 116, 600, 300);
		run(b, world({ floor: false, sides: false }), 2);
		expect(gone(b, world())).toBe(true);
	});

	it("its stub cut off: shorter, the piece at the right end", () => {
		const b = body(380, 116, 600, 300);
		const piece = cut(b, 76);
		expect(b.width).toBe(304);
		expect(b.x).toBe(562);
		expect(piece.x).toBe(752);
		expect(along(b, 0, 0, 10, 0)).toBe(10);
	});
});
