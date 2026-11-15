import { AppMark } from "@ckpro/ui/components/app-mark";
import { useSequence } from "@ckpro/ui/hooks/use-sequence";
import { easeDrop, reducedMotion } from "@ckpro/ui/lib/motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { daysUntil, parseDay } from "@/days";
import type { ExamTarget } from "@/tauri/api";
import { certName, certRole } from "@/words";

/** Where the printer's slot opens: under the title bar */
const SLOT_TOP = 52;
/** How far the ticket leans once it has fallen over, degrees */
const TILT = 5;

const rad = (deg: number) => (deg * Math.PI) / 180;
const move = (x: number, y: number, deg: number) => `translate(${x}px, ${y}px) rotate(${deg}deg)`;

/**
 * An exam day just set, printed as an admit ticket: a slot opens somewhere
 * along the top of the window, the ticket comes out of it, drops to the
 * bottom, stands, falls over, rests a moment and slides out of the window.
 * Its colours are the exam's. Over everything, it takes no pointer; under
 * reduced motion it is not printed at all. `onDone` once it is gone
 */
export function ExamTicket({ target, onDone }: { target: ExamTarget; onDone: () => void }) {
	const stage = useRef<HTMLDivElement>(null);
	const slot = useRef<HTMLDivElement>(null);
	const ticket = useRef<HTMLDivElement>(null);
	const done = useRef(onDone);
	done.current = onDone;

	const [still] = useState(reducedMotion);
	// Under reduced motion it is not printed: gone at once
	useEffect(() => {
		if (still) done.current();
	}, [still]);
	useSequence(async ({ play, wait }) => {
		const [box, s, t] = [stage.current, slot.current, ticket.current];
		if (!box || !s || !t) return;
		const W = box.clientWidth;
		const H = box.clientHeight - 4;
		const TW = t.offsetWidth;
		const TH = t.offsetHeight;
		// Somewhere along the top where the ticket, fallen over, is seen whole
		const cx = TW + TH / 2 + 24 + Math.random() * Math.max(0, W - TW - TH - 48);
		const line = SLOT_TOP + 9;
		t.style.left = `${cx - TW / 2}px`;
		s.style.left = `${cx - (TH + 44) / 2}px`;
		s.style.width = `${TH + 44}px`;
		// Printed upright (turned a quarter), its top edge first out of the slot
		const printed = (p: number) => line - TW / 2 + p * TW - TH / 2;
		const floor = H - TW / 2 - TH / 2;
		// Falling over about the corner on the floor, the far end coming to
		// rest a little raised, as a card lands on its edge
		const at = (deg: number) => {
			const a = rad(deg);
			const lift = TW * Math.sin(rad(TILT));
			const down = Math.min(1, Math.max(0, (90 - deg) / (90 + TILT)));
			const qx = cx - TH / 2;
			const qy = H - lift * down * down;
			const x = qx - ((TW / 2) * Math.cos(a) - (TH / 2) * Math.sin(a)) - cx;
			const y = qy - ((TW / 2) * Math.sin(a) + (TH / 2) * Math.cos(a)) - TH / 2;
			return { x, y };
		};
		const over = (deg: number) => {
			const { x, y } = at(deg);
			return move(x, y, deg);
		};
		// The fall over as frames along an ease-in, so its path stays exact
		const fall = Array.from({ length: 25 }, (_, i) => {
			const k = (i / 24) ** 2;
			return { transform: over(90 - k * (90 + TILT)) };
		});

		await play(
			s,
			[
				{ opacity: 0, scale: "0.3 1" },
				{ opacity: 1, scale: "1 1" },
			],
			{ duration: 350, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
		);
		// Out of the slot, line by line
		await play(
			t,
			[
				{
					opacity: 1,
					transform: move(0, printed(0), 90),
					clipPath: `inset(-40px -40px -40px ${TW}px)`,
				},
				{
					opacity: 1,
					transform: move(0, printed(1), 90),
					clipPath: "inset(-40px -40px -40px 0px)",
				},
			],
			{ duration: 1100, easing: "steps(18)" }
		);
		await wait(100);
		play(s, [{ opacity: 1 }, { opacity: 0, scale: "0.5 1" }], { duration: 300, delay: 200 });
		await play(
			t,
			[
				{ opacity: 1, transform: move(0, printed(1), 90) },
				{ opacity: 1, transform: move(0, floor, 90) },
			],
			{ duration: 550, easing: easeDrop }
		);
		await play(
			t,
			[
				{ opacity: 1, transform: move(0, floor, 90) },
				{ opacity: 1, transform: move(0, floor - 16, 90) },
				{ opacity: 1, transform: move(0, floor, 90) },
			],
			{ duration: 320, easing: "ease-in-out" }
		);
		await play(t, fall, { duration: 750, easing: "linear" });
		await play(
			t,
			[
				{ transform: over(-TILT) },
				{ transform: over(-TILT + 6), offset: 0.3 },
				{ transform: over(-TILT), offset: 0.6 },
				{ transform: over(-TILT + 2.5), offset: 0.8 },
				{ transform: over(-TILT) },
			],
			{ duration: 460, easing: "ease-out" }
		);
		await wait(1400);
		// Over the edge: out of the window
		const rest = at(-TILT);
		await play(
			t,
			[{ transform: over(-TILT) }, { transform: move(rest.x, rest.y + TW + 60, -TILT - 25) }],
			{ duration: 600, easing: easeDrop }
		);
		done.current();
	}, !still);

	const day = parseDay(target.date);
	const days = daysUntil(target.date, new Date());
	const cert = certName(target.certification);
	return createPortal(
		<div
			ref={stage}
			aria-hidden
			className="pointer-events-none fixed inset-0 z-floating overflow-hidden"
		>
			<div ref={slot} className="ticket-slot" style={{ top: SLOT_TOP, opacity: 0 }} />
			<div ref={ticket} className="ticket" data-cert={target.certification} style={{ opacity: 0 }}>
				<div className="ticket-main">
					<svg className="ticket-mark" viewBox="160 150 680 660" aria-hidden="true">
						<AppMark />
					</svg>
					<div className="ticket-brand">EXAM DAY · ADMIT ONE</div>
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
							{cert}-{target.date.slice(5).replace("-", "")}
						</span>
					</div>
				</div>
				<div className="ticket-stub">
					<span className="ticket-days">{Math.max(0, days)}</span>
					<span className="ticket-days-label">{days === 1 ? "DAY TO GO" : "DAYS TO GO"}</span>
					<i className="ticket-bar" />
				</div>
			</div>
		</div>,
		document.body
	);
}
