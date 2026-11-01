import { type DragEvent, useState } from "react";

/** The row being dragged, whichever list it belongs to */
let dragging: { scope: string; key: string } | null = null;

/** Over the lower half of the row under the pointer: it lands after it */
const lowerHalf = (e: DragEvent<HTMLElement>) => {
	const r = e.currentTarget.getBoundingClientRect();
	return e.clientY > r.top + r.height / 2;
};

/**
 * Reorder a list by dragging its rows (HTML drag and drop). Rows of one
 * `scope` take drops only from that scope, and only when `accept` agrees;
 * `onMove` gets the dragged row's key, the row it was dropped on and
 * whether after it. `row(key)` gives a row its props; `landing(key)` the
 * line where the dragged row would land
 */
export function useDragOrder(
	scope: string,
	onMove: (key: string, target: string, after: boolean) => void,
	accept: (key: string, target: string) => boolean = () => true
) {
	const [over, setOver] = useState<{ key: string; after: boolean } | null>(null);
	const takes = (target: string) =>
		dragging?.scope === scope && dragging.key !== target && accept(dragging.key, target);
	return {
		row: (key: string, enabled = true) => ({
			draggable: enabled,
			onDragStart: (e: DragEvent<HTMLElement>) => {
				dragging = { scope, key };
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", key);
			},
			onDragEnd: () => {
				dragging = null;
				setOver(null);
			},
			onDragOver: (e: DragEvent<HTMLElement>) => {
				if (!takes(key)) return;
				e.preventDefault();
				const after = lowerHalf(e);
				setOver(o => (o?.key === key && o.after === after ? o : { key, after }));
			},
			onDragLeave: (e: DragEvent<HTMLElement>) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null))
					setOver(o => (o?.key === key ? null : o));
			},
			onDrop: (e: DragEvent<HTMLElement>) => {
				if (!takes(key) || !dragging) return;
				e.preventDefault();
				const from = dragging.key;
				dragging = null;
				setOver(null);
				onMove(from, key, lowerHalf(e));
			},
		}),
		landing: (key: string) =>
			over?.key === key
				? over.after
					? "shadow-[inset_0_-2px_0_var(--highlight)]"
					: "shadow-[inset_0_2px_0_var(--highlight)]"
				: undefined,
	};
}
