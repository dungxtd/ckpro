import { cn } from "@cktry/ui/lib/utils";
import { type RefObject, useState } from "react";

/** A border dragged to resize the panels beside it */
const SPLITTER =
	"relative z-10 w-px shrink-0 cursor-col-resize bg-border transition-colors before:absolute before:inset-y-0 before:-inset-x-1 before:content-[''] hover:bg-highlight active:bg-highlight";

/**
 * Follow a border drag: `size` turns the pointer's x into the new size,
 * `move` shows it as it goes, `done` keeps the last one when it is let go
 */
function dragBorder(
	event: React.PointerEvent,
	size: (x: number) => number,
	move: (size: number) => void,
	done: (size: number) => void,
	cancel: () => void
) {
	event.currentTarget.setPointerCapture(event.pointerId);
	let last: number | null = null;
	const onMove = (e: PointerEvent) => {
		last = size(e.clientX);
		move(last);
	};
	const stop = () => {
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onCancel);
	};
	const onUp = () => {
		stop();
		if (last !== null) done(last);
	};
	// Taken away (the system's own gesture): the border goes back
	const onCancel = () => {
		stop();
		cancel();
	};
	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", onUp);
	window.addEventListener("pointercancel", onCancel);
}

/** The border between two columns: dragged, or moved with the arrow keys
 * once focused. Its props come from `usePanelSize` */
export function Splitter({
	label,
	value,
	min,
	max,
	onPointerDown,
	onStep,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	onPointerDown: (event: React.PointerEvent) => void;
	onStep: (dir: -1 | 1) => void;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a focusable splitter, which <hr> is not
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label={label}
			aria-valuenow={value}
			aria-valuemin={min}
			aria-valuemax={max}
			tabIndex={0}
			onPointerDown={onPointerDown}
			onKeyDown={e => {
				if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
					e.preventDefault();
					onStep(e.key === "ArrowLeft" ? -1 : 1);
				}
			}}
			className={cn(SPLITTER, "outline-none focus-visible:bg-highlight")}
		/>
	);
}

/**
 * A column's width beside a `Splitter`, kept where `save` puts it: what is saved, what
 * a drag shows meanwhile, and the border's handle (drag, or arrows by
 * `step`). `fromPointer` turns the pointer's x into a size, given the `area`'s
 * box; every size stays within `min` and `max`.
 */
export function usePanelSize({
	area,
	saved,
	save,
	min,
	max,
	step,
	fromPointer,
}: {
	area: RefObject<HTMLElement | null>;
	saved: number;
	save: (size: number) => void;
	min: number;
	max: number;
	/** Per arrow press, rightwards (negative: the border is on the panel's left) */
	step: number;
	fromPointer: (x: number, area: DOMRect) => number;
}) {
	const [dragged, setDragged] = useState<number | null>(null);
	const clamp = (size: number) => Math.min(max, Math.max(min, size));
	const size = dragged ?? saved;
	return {
		size,
		handle: {
			value: Math.round(size),
			min,
			max,
			onPointerDown: (event: React.PointerEvent) => {
				const box = area.current?.getBoundingClientRect();
				if (!box) return;
				dragBorder(
					event,
					x => clamp(fromPointer(x, box)),
					setDragged,
					last => {
						save(last);
						setDragged(null);
					},
					() => setDragged(null)
				);
			},
			onStep: (dir: -1 | 1) => save(clamp(size + dir * step)),
		},
	};
}
