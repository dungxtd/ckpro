import { flushSync } from "react-dom";

/** The window's moves: as long as the sidebar's, on its easing */
const DURATION_MS = 420;
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

/** What moves in a morph: by name, how to find it (asked before the change and after) */
export type MorphParts = Record<string, () => HTMLElement | null>;

/** The transform that puts box `to` over box `from` (from its top left corner) */
const over = (from: DOMRect, to: DOMRect) =>
	`translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;

/**
 * Run `change` (a state update) as one move: each part found before and
 * after travels from its old box to its new one, the old look fading into
 * the new. A copy of the old part leaves as the new one arrives, both with
 * Web Animations, the same on every web view. A plain change with reduced
 * motion
 */
export function morph(change: () => void, parts: MorphParts) {
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return change();

	// The old parts, as they look and where they are
	const before = new Map<string, { box: DOMRect; copy: HTMLElement }>();
	for (const [name, find] of Object.entries(parts)) {
		const element = find();
		if (!element) continue;
		const box = element.getBoundingClientRect();
		const copy = element.cloneNode(true) as HTMLElement;
		copy.removeAttribute("id");
		copy.setAttribute("aria-hidden", "true");
		copy.inert = true;
		Object.assign(copy.style, {
			position: "fixed",
			left: `${box.left}px`,
			top: `${box.top}px`,
			width: `${box.width}px`,
			height: `${box.height}px`,
			margin: "0",
			zIndex: "60",
			pointerEvents: "none",
			transformOrigin: "top left",
		});
		before.set(name, { box, copy });
	}

	flushSync(change);

	const timing = { duration: DURATION_MS, easing: EASING };
	for (const [name, find] of Object.entries(parts)) {
		const old = before.get(name);
		const element = find();
		if (!old || !element) continue;
		const box = element.getBoundingClientRect();
		if (!box.width || !box.height) continue;
		// The old look travels to the new box and fades…
		document.body.append(old.copy);
		old.copy
			.animate(
				[
					{ transform: "none", opacity: 1 },
					{ transform: over(box, old.box), opacity: 0 },
				],
				{
					...timing,
					fill: "forwards",
				}
			)
			.finished.finally(() => old.copy.remove());
		// …as the new one comes from the old box
		element.animate(
			[
				{ transformOrigin: "top left", transform: over(old.box, box), opacity: 0 },
				{ transformOrigin: "top left", transform: "none", opacity: 1 },
			],
			timing
		);
	}
}
