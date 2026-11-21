/**
 * A card thrown about the window (study/exam-ticket.tsx): one rigid body
 * under gravity, struck off the floor and the sides on its corners, held at
 * a point by the pointer. Pure: the component steps it and draws it
 */

/** Pull down, px/s² */
export const GRAVITY = 2600;
/** How much of its speed a corner keeps off the floor or a side */
const BOUNCE = 0.38;
/** Friction where a corner touches */
const FRICTION = 0.45;
/** How hard the held point is pulled to the pointer, and how it is damped
 * (just short of critical: it follows without swinging) */
const PULL = 420;
const PULL_DAMPING = 2 * Math.sqrt(PULL) * 0.9;

/** The card: its middle, angle (radians), their speeds, and its size */
export interface Body {
	x: number;
	y: number;
	a: number;
	vx: number;
	vy: number;
	w: number;
	width: number;
	height: number;
}

/** Where it moves: the window's size, the line it may not rise above, and
 * whether the floor and the sides stop it (off: it falls out) */
export interface World {
	width: number;
	height: number;
	top: number;
	floor: boolean;
	sides: boolean;
}

/** The point held, in the card's own frame, and where the pointer is */
export interface Grip {
	lx: number;
	ly: number;
	px: number;
	py: number;
}

export const body = (width: number, height: number, x: number, y: number): Body => ({
	x,
	y,
	a: 0,
	vx: 0,
	vy: 0,
	w: 0,
	width,
	height,
});

/** Mass 1: turning inertia of a flat rectangle */
const inertia = (b: Body) => (b.width * b.width + b.height * b.height) / 12;

/** A point of the card's own frame, turned into the window's (from its middle) */
const turned = (b: Body, lx: number, ly: number): [number, number] => {
	const c = Math.cos(b.a);
	const s = Math.sin(b.a);
	return [lx * c - ly * s, lx * s + ly * c];
};

/** The grip at a point of the window, on the card */
export function gripAt(b: Body, px: number, py: number): Grip {
	const c = Math.cos(-b.a);
	const s = Math.sin(-b.a);
	const dx = px - b.x;
	const dy = py - b.y;
	return { lx: dx * c - dy * s, ly: dx * s + dy * c, px, py };
}

/** The same point, as `gripAt` gives it, moved to the card's top-left
 * corner: where it is on the drawn card */
export const onCard = (b: Body, g: Pick<Grip, "lx" | "ly">) => ({
	x: g.lx + b.width / 2,
	y: g.ly + b.height / 2,
});

const push = (b: Body, I: number, rx: number, ry: number, jx: number, jy: number) => {
	b.vx += jx;
	b.vy += jy;
	b.w += (rx * jy - ry * jx) / I;
};

/** A corner at (rx, ry) from the middle, `depth` past a surface whose normal
 * is (nx, ny): put back, its speed into the surface turned back (some lost),
 * friction along it. The speed it struck at, 0 if moving away */
function strike(b: Body, I: number, rx: number, ry: number, nx: number, ny: number, depth: number) {
	b.x += nx * depth * 0.9;
	b.y += ny * depth * 0.9;
	const vn = (b.vx - b.w * ry) * nx + (b.vy + b.w * rx) * ny;
	if (vn >= 0) return 0;
	const rn = rx * ny - ry * nx;
	const j = (-(1 + BOUNCE) * vn) / (1 + (rn * rn) / I);
	push(b, I, rx, ry, nx * j, ny * j);
	const [tx, ty] = [-ny, nx];
	const vt = (b.vx - b.w * ry) * tx + (b.vy + b.w * rx) * ty;
	const rt = rx * ty - ry * tx;
	const limit = FRICTION * j;
	const jt = Math.max(-limit, Math.min(limit, -vt / (1 + (rt * rt) / I)));
	push(b, I, rx, ry, tx * jt, ty * jt);
	return -vn;
}

/**
 * The card `dt` seconds on: gravity, the grip's pull (held, it keeps its
 * angle: pulled along, not turned), then its corners off the floor, the
 * sides and the top. The hardest it struck the floor, px/s (0: it did not)
 */
export function step(b: Body, world: World, dt: number, grip: Grip | null = null): number {
	const I = inertia(b);
	let fx = 0;
	let fy = GRAVITY;
	if (grip) {
		const [rx, ry] = turned(b, grip.lx, grip.ly);
		fx += (grip.px - (b.x + rx)) * PULL - b.vx * PULL_DAMPING;
		fy += (grip.py - (b.y + ry)) * PULL - b.vy * PULL_DAMPING;
		b.w = 0;
	}
	b.vx += fx * dt;
	b.vy += fy * dt;
	b.x += b.vx * dt;
	b.y += b.vy * dt;
	b.a += b.w * dt;
	let landed = 0;
	const hw = b.width / 2;
	const hh = b.height / 2;
	for (const [lx, ly] of [
		[-hw, -hh],
		[hw, -hh],
		[hw, hh],
		[-hw, hh],
	]) {
		const [rx, ry] = turned(b, lx, ly);
		const x = b.x + rx;
		const y = b.y + ry;
		if (world.floor && y > world.height)
			landed = Math.max(landed, strike(b, I, rx, ry, 0, -1, y - world.height));
		if (world.sides && x < 0) strike(b, I, rx, ry, 1, 0, -x);
		if (world.sides && x > world.width) strike(b, I, rx, ry, -1, 0, x - world.width);
		if (world.sides && !grip && y < world.top) strike(b, I, rx, ry, 0, 1, world.top - y);
	}
	if (grip) b.w = 0;
	return landed;
}

/** Whether it has left the window, past any edge */
export const gone = (b: Body, world: World) => {
	const r = Math.hypot(b.width, b.height) / 2;
	return b.y - r > world.height || b.x + r < 0 || b.x - r > world.width || b.y + r < 0;
};

/** Cut `by` off the card's right end (its stub torn off): shorter, its
 * middle moved back along it. The cut piece's middle, in the window */
export function cut(b: Body, by: number): { x: number; y: number } {
	const c = Math.cos(b.a);
	const s = Math.sin(b.a);
	const piece = { x: b.x + (b.width / 2 - by / 2) * c, y: b.y + (b.width / 2 - by / 2) * s };
	b.width -= by;
	b.x -= (by / 2) * c;
	b.y -= (by / 2) * s;
	return piece;
}

/** How far along the card's length a move from (x0, y0) to (x, y) goes */
export const along = (b: Body, x0: number, y0: number, x: number, y: number) =>
	(x - x0) * Math.cos(b.a) + (y - y0) * Math.sin(b.a);

/**
 * The light on the card, from above: a band of sheen placed by its angle,
 * place and speed (percent across), the shade on the side turned away, and
 * the shadow it casts, which falls straight down whatever its angle (in its
 * own turned frame) and grows longer and softer the higher it is
 */
export function lighting(b: Body, world: World) {
	const lift = Math.max(0, Math.min(1, (world.height - (b.y + b.height / 2)) / world.height));
	const d = 6 + lift * 30;
	return {
		sheen: Math.sin(b.a * 1.6) * 70 + (b.x / world.width - 0.5) * 50 + b.vx * 0.012,
		tilt: (-b.a * 180) / Math.PI,
		shade: 0.02 + Math.min(0.04, Math.abs(Math.sin(b.a)) * 0.05),
		shadowX: d * Math.sin(b.a),
		shadowY: d * Math.cos(b.a),
		shadowBlur: 10 + lift * 30,
		shadowAlpha: 0.5 - lift * 0.22,
	};
}
