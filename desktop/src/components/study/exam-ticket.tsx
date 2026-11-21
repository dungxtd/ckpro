import { AppMark } from "@ckpro/ui/components/app-mark";
import { useSequence } from "@ckpro/ui/hooks/use-sequence";
import { reducedMotion } from "@ckpro/ui/lib/motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	along,
	type Body,
	body,
	cut,
	type Grip,
	gone,
	gripAt,
	lighting,
	onCard,
	step,
	type World,
} from "@/components/study/ticket-physics";
import { daysUntil, parseDay } from "@/days";
import type { ExamTarget } from "@/tauri/api";
import { certName, certRole } from "@/words";

/** Where the printer's slot opens: under the title bar */
const SLOT_TOP = 52;
/** How long it stays, left alone, once it falls, seconds */
const LIFE = 5;
/** Steps a frame: small enough for its corners to strike true */
const STEPS = 8;
/** The stub's width (index.css `.ticket-stub`), px */
const STUB = 76;
/** How far the stub is pulled along the card before it tears off, px */
const TEAR = 60;
/** How hard a landing brings a goal's stamp down, px/s */
const STAMPING = 500;
/** How far it leans held, degrees at most */
const LEAN = 22;

/** Where a body is drawn: its top-left corner, turned about its middle */
const placed = (b: Body) =>
	`translate(${b.x - b.width / 2}px, ${b.y - b.height / 2}px) rotate(${b.a}rad)`;
const clamp = (n: number, at: number) => Math.max(-at, Math.min(at, n));
const spin = () => (Math.random() < 0.5 ? -1 : 1);

/**
 * An exam day just set, printed as an admit ticket: a slot opens along the
 * top of the window, the ticket comes out of it and drops under gravity,
 * striking the bottom on a corner, bouncing and tumbling off the sides,
 * lit from above (a band of sheen, its shadow longer the higher it is).
 * It can be grabbed and thrown: held, it keeps its angle, leans from the
 * pull and stays as long as it is held; let go, it falls out of the window.
 * Its stub, pulled along the card, tears off and falls on its own. Left
 * alone, it drops out of the window `LIFE` seconds after it falls. Its
 * colours are the exam's; a goal (not booked yet) prints on blank paper in
 * the exam's ink, no barcode, and its GOAL stamp comes down as it lands.
 * Over everything, only the ticket takes the pointer; under reduced motion
 * it is not printed at all. `onDone` once it is gone
 */
export function ExamTicket({ target, onDone }: { target: ExamTarget; onDone: () => void }) {
	const stage = useRef<HTMLDivElement>(null);
	const slot = useRef<HTMLDivElement>(null);
	const ticket = useRef<HTMLDivElement>(null);
	const stamp = useRef<HTMLSpanElement>(null);
	const torn = useRef<HTMLDivElement>(null);
	const done = useRef(onDone);
	done.current = onDone;
	const goal = target.goal;

	const [still] = useState(reducedMotion);
	// Under reduced motion it is not printed: gone at once
	useEffect(() => {
		if (still) done.current();
	}, [still]);
	// Printed: where it came out, to fall from
	const [printed, setPrinted] = useState<{ x: number; y: number } | null>(null);
	// Its stub torn off, falling on its own: drawn from where it came off
	const [stubAt, setStubAt] = useState<string | null>(null);

	useSequence(async ({ play }) => {
		const [box, s, t] = [stage.current, slot.current, ticket.current];
		if (!box || !s || !t) return;
		const W = t.offsetWidth;
		const H = t.offsetHeight;
		// Somewhere along the top, clear of the sides
		const cx = W / 2 + 24 + Math.random() * Math.max(0, box.clientWidth - W - 48);
		const line = SLOT_TOP + 9;
		s.style.left = `${cx - (W + 40) / 2}px`;
		s.style.width = `${W + 40}px`;
		await play(
			s,
			[
				{ opacity: 0, scale: "0.3 1" },
				{ opacity: 1, scale: "1 1" },
			],
			{ duration: 350, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
		);
		// Out of the slot, flat, line by line
		const at = (y: number) => `translate(${cx - W / 2}px, ${y}px)`;
		await play(
			t,
			[
				{ opacity: 1, transform: at(line - H), clipPath: `inset(${H}px -40px -40px -40px)` },
				{ opacity: 1, transform: at(line), clipPath: "inset(0px -40px -40px -40px)" },
			],
			{ duration: 700, easing: "steps(14)" }
		);
		play(s, [{ opacity: 1 }, { opacity: 0, scale: "0.5 1" }], { duration: 300 });
		// Handed over to the fall: drawn by the frame from here on
		t.style.opacity = "1";
		t.style.transform = at(line);
		for (const a of t.getAnimations()) a.cancel();
		setPrinted({ x: cx, y: line + H / 2 });
	}, !still);

	// The fall, the grip and the light, frame by frame
	useEffect(() => {
		const [box, el] = [stage.current, ticket.current];
		if (!printed || !box || !el) return;
		const card = body(el.offsetWidth, el.offsetHeight, printed.x, printed.y);
		card.vx = (Math.random() - 0.5) * 80;
		card.vy = 60;
		card.w = spin() * 2.2;
		const world: World = {
			width: box.clientWidth,
			height: box.clientHeight,
			top: SLOT_TOP - 8,
			floor: true,
			sides: true,
		};
		const free: World = { ...world, floor: false, sides: false };
		let grip: Grip | null = null;
		let pulled: { x: number; y: number } | null = null;
		let stub: Body | null = null;
		let age = 0;
		let leaving = false;
		let stamped = false;
		let lean = [0, 0];
		let last = performance.now();
		let frame = 0;

		const draw = (b: Body, node: HTMLElement, tilt = "") => {
			const l = lighting(b, world);
			node.style.transform = `${placed(b)}${tilt}`;
			const vars = {
				"--sheen": `${l.sheen}%`,
				"--tilt": `${l.tilt}deg`,
				"--shade": l.shade,
				"--shadow-x": `${l.shadowX}px`,
				"--shadow-y": `${l.shadowY}px`,
				"--shadow-blur": `${l.shadowBlur}px`,
				"--shadow-alpha": l.shadowAlpha,
				"--holo": `${50 + Math.sin(b.a) * 60 + lean[0] * 3 + (b.x / world.width) * 40}%`,
			};
			for (const [k, v] of Object.entries(vars)) node.style.setProperty(k, String(v));
		};
		const leave = () => {
			leaving = true;
			world.floor = false;
			world.sides = false;
		};
		const tearOff = () => {
			pulled = null;
			grip = null;
			delete el.dataset.held;
			const at = cut(card, STUB);
			const c = Math.cos(card.a);
			stub = { ...body(STUB, card.height, at.x, at.y), a: card.a };
			stub.vx = card.vx + 300 * c;
			stub.vy = card.vy - 200;
			stub.w = spin() * 7;
			el.dataset.torn = "";
			el.style.width = `${card.width}px`;
			card.w += (Math.random() - 0.5) * 3;
			setStubAt(placed(stub));
		};

		const down = (e: PointerEvent) => {
			if (leaving) return;
			el.setPointerCapture(e.pointerId);
			el.dataset.held = "";
			grip = gripAt(card, e.clientX, e.clientY);
			pulled =
				!stub && (e.target as Element).closest(".ticket-stub")
					? { x: e.clientX, y: e.clientY }
					: null;
		};
		const move = (e: PointerEvent) => {
			const at = onCard(card, gripAt(card, e.clientX, e.clientY));
			el.style.setProperty("--glint-x", `${at.x}px`);
			el.style.setProperty("--glint-y", `${at.y}px`);
			el.style.setProperty("--glint", grip ? "0.22" : "0.12");
			if (!grip) return;
			grip.px = e.clientX;
			grip.py = e.clientY;
			if (pulled && along(card, pulled.x, pulled.y, e.clientX, e.clientY) > TEAR) tearOff();
		};
		// Let go: it falls out of the window, through the floor
		const up = () => {
			if (!grip) return;
			grip = null;
			pulled = null;
			delete el.dataset.held;
			leave();
		};
		const out = () => el.style.setProperty("--glint", "0");
		el.addEventListener("pointerdown", down);
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerenter", move);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", up);
		el.addEventListener("pointerleave", out);
		el.dataset.live = "";

		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			world.width = free.width = box.clientWidth;
			world.height = free.height = box.clientHeight;
			let landed = 0;
			for (let i = 0; i < STEPS; i++) {
				landed = Math.max(landed, step(card, world, dt / STEPS, grip));
				if (stub) step(stub, free, dt / STEPS);
			}
			if (goal && !stamped && landed > STAMPING) {
				stamped = true;
				stamp.current?.animate(
					[
						{ opacity: 0, scale: 2.6, rotate: "-24deg" },
						{ opacity: 0.95, scale: 0.92, rotate: "-9deg", offset: 0.7 },
						{ opacity: 0.75, scale: 1, rotate: "-9deg" },
					],
					{ duration: 260, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)", fill: "forwards" }
				);
				card.w += (Math.random() - 0.5) * 1.2;
			}
			if (!grip && !leaving) {
				age += dt;
				if (age > LIFE) {
					leave();
					card.w += (Math.random() - 0.5) * 1.5;
				}
			}
			// Held, it leans away from the pull, as a card held at a point does
			const want = grip ? [clamp(card.vx * 0.02, LEAN), clamp(-card.vy * 0.02, LEAN)] : [0, 0];
			lean = [lean[0] + (want[0] - lean[0]) * 0.18, lean[1] + (want[1] - lean[1]) * 0.18];
			draw(card, el, ` perspective(900px) rotateY(${lean[0]}deg) rotateX(${lean[1]}deg)`);
			if (stub) {
				if (torn.current) draw(stub, torn.current);
				if (gone(stub, free)) {
					stub = null;
					setStubAt(null);
				}
			}
			if (gone(card, world) && !stub) {
				done.current();
				return;
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
			el.removeEventListener("pointerdown", down);
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerenter", move);
			el.removeEventListener("pointerup", up);
			el.removeEventListener("pointercancel", up);
			el.removeEventListener("pointerleave", out);
		};
	}, [printed, goal]);

	const day = parseDay(target.date);
	const days = Math.max(0, daysUntil(target.date, new Date()));
	const cert = certName(target.certification);
	const kind = goal ? "ticket ticket-goal" : "ticket";
	return createPortal(
		<div
			ref={stage}
			aria-hidden
			className="pointer-events-none fixed inset-0 z-floating overflow-hidden"
		>
			<div ref={slot} className="ticket-slot" style={{ top: SLOT_TOP, opacity: 0 }} />
			<div ref={ticket} className={kind} data-cert={target.certification} style={{ opacity: 0 }}>
				<div className="ticket-main">
					<svg className="ticket-mark" viewBox="160 150 680 660" aria-hidden="true">
						<AppMark />
					</svg>
					<div className="ticket-brand">
						{goal ? "YOUR GOAL · READY BY" : "EXAM DAY · ADMIT ONE"}
					</div>
					<div className="ticket-date">
						{day.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase()}{" "}
						{day.getFullYear()}
					</div>
					<div className="ticket-role">
						{cert} · {certRole(target.certification)}
					</div>
					<div className="ticket-meta">
						<span>{day.toLocaleDateString("en-GB", { weekday: "long" }).toUpperCase()}</span>
						<span>
							{goal ? "NOT BOOKED YET" : `${cert}-${target.date.slice(5).replace("-", "")}`}
						</span>
					</div>
					{goal && (
						<span ref={stamp} className="ticket-stamp">
							GOAL
						</span>
					)}
				</div>
				<Stub days={days} goal={goal} />
				<i className="ticket-sheen" />
			</div>
			{/* The stub once torn off, falling on its own */}
			{stubAt && (
				<div
					ref={torn}
					className={`${kind} ticket-torn`}
					data-cert={target.certification}
					style={{ transform: stubAt }}
				>
					<Stub days={days} goal={goal} />
				</div>
			)}
		</div>,
		document.body
	);
}

/** The ticket's stub: the days to go, the barcode of a booked day, its foil */
function Stub({ days, goal }: { days: number; goal: boolean }) {
	return (
		<div className="ticket-stub">
			<span className="ticket-days">{days}</span>
			<span className="ticket-days-label">{days === 1 ? "DAY TO GO" : "DAYS TO GO"}</span>
			{!goal && <i className="ticket-bar" />}
			<i className="ticket-holo" />
		</div>
	);
}
