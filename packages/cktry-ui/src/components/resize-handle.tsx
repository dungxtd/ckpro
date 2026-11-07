import { cn } from "@cktry/ui/lib/utils";
import { useRef } from "react";

/** How far an arrow key moves it */
const STEP = 40;
/** Within this of `min`, the panel counts as folded */
export const FOLD_SLACK = 8;

/**
 * The grabber on a panel's top edge that sets its height: drag it (up grows
 * the panel), double-click it or press Enter to go between `min` and a
 * middle height, arrow keys to move it. Dropped near `min`, it snaps there
 */
export function ResizeHandle({
	label,
	value,
	min,
	max,
	onChange,
	className,
}: {
	/** What it resizes, for screen readers ("Resize the exam") */
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (height: number) => void;
	className?: string;
}) {
	const clamp = (h: number) => Math.round(Math.min(max, Math.max(min, h)));
	const drag = useRef<{ y: number; from: number } | null>(null);
	const middle = clamp((min + max) / 2);
	const toggle = () => onChange(value > min + FOLD_SLACK ? min : middle);
	return (
		// biome-ignore lint/a11y/useSemanticElements: a focusable separator is the ARIA pattern for a splitter; <hr> cannot hold focus
		<div
			role="separator"
			aria-orientation="horizontal"
			aria-label={label}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={value}
			tabIndex={0}
			onPointerDown={e => {
				// Dragging moves the panel, not a selection over the text above
				e.preventDefault();
				e.currentTarget.focus();
				e.currentTarget.setPointerCapture(e.pointerId);
				drag.current = { y: e.clientY, from: value };
			}}
			// WebKit starts a selection on the mouse's own press too
			onMouseDown={e => e.preventDefault()}
			onPointerMove={e => {
				if (drag.current) onChange(clamp(drag.current.from + drag.current.y - e.clientY));
			}}
			// A drag the system takes away (the window loses focus) ends there
			onPointerCancel={() => {
				drag.current = null;
			}}
			onLostPointerCapture={() => {
				drag.current = null;
			}}
			onPointerUp={e => {
				const moved = drag.current && Math.abs(e.clientY - drag.current.y) > 2;
				drag.current = null;
				// Let go near the bottom: all the way down
				if (moved && value < min + 32) onChange(min);
			}}
			onDoubleClick={toggle}
			onKeyDown={e => {
				if (e.key === "ArrowUp") onChange(clamp(value + STEP));
				else if (e.key === "ArrowDown") onChange(clamp(value - STEP));
				else if (e.key === "Enter" || e.key === " ") toggle();
				else return;
				e.preventDefault();
			}}
			className={cn(
				"group/handle flex h-3 w-full cursor-row-resize touch-none select-none items-center justify-center outline-none",
				className
			)}
		>
			<span className="h-1 w-9 rounded-full bg-foreground/20 transition-colors group-hover/handle:bg-foreground/35 group-focus-visible/handle:bg-highlight" />
		</div>
	);
}
