import { Button } from "@ckpro/ui/components/button";
import { MenuItem, menu } from "@ckpro/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { useElementSize } from "@ckpro/ui/hooks/use-element-size";
import { reducedMotion } from "@ckpro/ui/lib/motion";
import { cn } from "@ckpro/ui/lib/utils";
import { SlidersHorizontal } from "lucide-react";
import type * as React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useHomeLayout } from "@/stores/settings";
import {
	arrange,
	COLUMNS,
	GAP_PX,
	type ModuleSize,
	NARROW_PX,
	type Place,
	type Places,
	ROW_PX,
	reading,
	SPAN,
	settle,
	toSaved,
} from "./layout";

export type ModuleSpec = {
	id: string;
	/** Its name, said when it is moved, hidden or added */
	name: string;
	size: ModuleSize;
	node: React.ReactNode;
};

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const still = reducedMotion;

/**
 * Home's modules on a 4-column grid, each where the candidate put it.
 * Manage modules turns on arranging: a module is dragged (a dashed slot
 * shows where it lands) or, focused, lifted with Space and moved with the
 * arrow keys; what it lands on moves down, rows left empty close up. A module
 * can be hidden (−) and added back; Reset returns to the default, each
 * undoable. Narrower than `NARROW_PX`: two columns in the saved order
 */
export function ModuleGrid({ modules, defaults }: { modules: ModuleSpec[]; defaults: Places }) {
	const [layout, setLayout] = useHomeLayout();
	const sizeOf = (id: string) => modules.find(m => m.id === id)?.size ?? "s";
	const hidden = (layout.hidden ?? []).filter(id => modules.some(m => m.id === id));
	const saved = arrange(
		layout,
		modules.map(m => m.id),
		defaults,
		sizeOf
	);
	// While a module is being moved: the places it would leave
	const [moving, setMoving] = useState<Places | null>(null);
	// Moving modules by drag or keys: turned on from Manage modules
	const [editing, setEditing] = useState(false);
	// The Manage modules popover
	const [managing, setManaging] = useState(false);
	const places = moving ?? saved;
	const [grid, { width }] = useElementSize<HTMLDivElement>();
	const narrow = width > 0 && width < NARROW_PX;
	const live = useRef<HTMLDivElement>(null);
	const say = (text: string) => {
		if (live.current) live.current.textContent = text;
	};
	const nameOf = (id: string) => modules.find(m => m.id === id)?.name ?? id;
	const where = (p: Place) => `column ${p.x + 1}, row ${p.y + 1}`;

	// What moved slides from where it was (each module's box before a change)
	const boxes = useRef(new Map<string, DOMRect>());
	const cells = useRef(new Map<string, HTMLElement>());
	const remember = () => {
		boxes.current = new Map([...cells.current].map(([id, el]) => [id, el.getBoundingClientRect()]));
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: after every placing
	useLayoutEffect(() => {
		const before = boxes.current;
		boxes.current = new Map();
		if (still() || before.size === 0) return;
		for (const [id, el] of cells.current) {
			const was = before.get(id);
			if (!was || id === drag.current?.id) continue;
			const now = el.getBoundingClientRect();
			const dx = was.left - now.left;
			const dy = was.top - now.top;
			if (dx || dy)
				el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], {
					duration: 280,
					easing: EASE,
				});
		}
	}, [places, narrow]);

	const save = (next: Places, hiddenNow = hidden) => setLayout(toSaved(next, hiddenNow, layout));
	const undoable = (text: string) => {
		const before = layout;
		toast(text, {
			action: {
				label: "Undo",
				onClick: () => {
					remember();
					setLayout(before);
				},
			},
		});
		say(`${text}. Undo is in the notification.`);
	};
	const hide = (id: string) => {
		remember();
		const { [id]: _, ...rest } = places;
		save(settle(rest, sizeOf), [...hidden, id]);
		undoable(`${nameOf(id)} hidden`);
	};
	const add = (id: string) => {
		remember();
		save(
			settle({ ...places, [id]: { x: 0, y: 999 } }, sizeOf),
			hidden.filter(h => h !== id)
		);
		say(`${nameOf(id)} added at the bottom`);
	};
	const reset = () => {
		remember();
		const before = layout;
		setLayout({ places: [], hidden: [], custom: false });
		toast("Layout reset", {
			action: {
				label: "Undo",
				onClick: () => {
					remember();
					setLayout(before);
				},
			},
		});
		say("Layout reset. Undo is in the notification.");
	};

	// Dragging: the module follows the pointer; the slot shows its cell
	const drag = useRef<{
		id: string;
		x: number;
		y: number;
		on: boolean;
		start: Places;
		cell: string;
	} | null>(null);
	const [slot, setSlot] = useState<{ id: string } | null>(null);
	const down = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
		if (!editing || narrow || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
		e.preventDefault();
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = { id, x: e.clientX, y: e.clientY, on: false, start: places, cell: "" };
	};
	const move = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = drag.current;
		if (!d) return;
		const dx = e.clientX - d.x;
		const dy = e.clientY - d.y;
		if (!d.on) {
			if (Math.hypot(dx, dy) < 5) return;
			d.on = true;
			setSlot({ id: d.id });
		}
		const el = e.currentTarget;
		el.style.translate = `${dx}px ${dy}px`;
		const column = ((el.parentElement?.clientWidth ?? 0) - GAP_PX * (COLUMNS - 1)) / COLUMNS;
		const [w] = SPAN[sizeOf(d.id)];
		const start = d.start[d.id];
		const x = Math.max(0, Math.min(COLUMNS - w, start.x + Math.round(dx / (column + GAP_PX))));
		const y = Math.max(0, start.y + Math.round(dy / (ROW_PX + GAP_PX)));
		if (d.cell === `${x},${y}`) return;
		d.cell = `${x},${y}`;
		remember();
		setMoving(settle({ ...d.start, [d.id]: { x, y } }, sizeOf, d.id));
	};
	const up = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = drag.current;
		drag.current = null;
		if (!d?.on) return;
		const el = e.currentTarget;
		const from = el.getBoundingClientRect();
		el.style.translate = "";
		setSlot(null);
		if (moving) {
			save(moving);
			say(`${nameOf(d.id)} moved to ${where(moving[d.id])}`);
		}
		setMoving(null);
		requestAnimationFrame(() => {
			const to = el.getBoundingClientRect();
			if (!still())
				el.animate(
					[{ translate: `${from.left - to.left}px ${from.top - to.top}px` }, { translate: "0 0" }],
					{ duration: 280, easing: EASE }
				);
		});
	};

	// Keyboard: Space lifts and drops, the arrows move a cell, Escape puts it
	// back, Delete hides
	const [lifted, setLifted] = useState<{ id: string; start: Places } | null>(null);
	const keys = (e: React.KeyboardEvent<HTMLDivElement>, id: string) => {
		if (!editing || e.target !== e.currentTarget) return;
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			if (narrow) return say("Widen the window to move modules");
			if (!lifted) {
				setLifted({ id, start: places });
				say(
					`${nameOf(id)} lifted, ${where(places[id])}. Arrow keys move it, Space drops it, Escape puts it back.`
				);
			} else {
				save(places);
				setMoving(null);
				setLifted(null);
				say(`${nameOf(id)} dropped at ${where(places[id])}`);
			}
			return;
		}
		if (e.key === "Escape" && lifted) {
			remember();
			setMoving(null);
			setLifted(null);
			return say(`${nameOf(id)} back at ${where(lifted.start[id])}`);
		}
		if ((e.key === "Delete" || e.key === "Backspace") && !lifted) {
			e.preventDefault();
			return hide(id);
		}
		const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
			e.key
		];
		if (!lifted || !step) return;
		e.preventDefault();
		const p = places[id];
		const [w] = SPAN[sizeOf(id)];
		remember();
		const next = settle(
			{
				...lifted.start,
				[id]: {
					x: Math.max(0, Math.min(COLUMNS - w, p.x + step[0])),
					y: Math.max(0, p.y + step[1]),
				},
			},
			sizeOf,
			id
		);
		setMoving(next);
		say(where(next[id]));
	};

	const order = reading(places);
	// The module being dragged stays in the cell it was picked up from (it
	// follows the pointer from there); the slot shows where it lands
	const dragged = slot && drag.current?.id === slot.id ? drag.current.start : null;
	const placeOf = (id: string, landing = false): React.CSSProperties => {
		const [w, h] = SPAN[sizeOf(id)];
		const p = (!landing && dragged && id === slot?.id ? dragged : places)[id];
		return narrow
			? { gridColumn: `span ${Math.min(w, 2)}`, gridRow: `span ${h}`, order: order.indexOf(id) }
			: { gridColumn: `${p.x + 1} / span ${w}`, gridRow: `${p.y + 1} / span ${h}` };
	};
	const slotPlace = slot && moving ? placeOf(slot.id, true) : null;

	return (
		<div className="flex flex-col gap-4">
			<div
				ref={grid}
				className={cn("relative grid gap-[14px]", narrow ? "grid-cols-2" : "grid-cols-4")}
				style={{ gridAutoRows: ROW_PX }}
			>
				{slotPlace && (
					<div
						aria-hidden
						className="rounded-2xl border-[1.5px] border-foreground/30 border-dashed bg-fill-quiet"
						style={slotPlace}
					/>
				)}
				{modules
					.filter(m => places[m.id])
					.map(m => (
						// biome-ignore lint/a11y/useSemanticElements: a module, not a form
						<div
							key={m.id}
							ref={el => {
								if (el) cells.current.set(m.id, el);
								else cells.current.delete(m.id);
							}}
							data-module={m.id}
							role="group"
							aria-label={m.name}
							aria-roledescription={editing ? "movable module" : undefined}
							tabIndex={editing ? 0 : undefined}
							className={cn(
								"module relative min-w-0",
								editing &&
									"cursor-grab rounded-2xl focus-visible:outline-2 focus-visible:outline-highlight focus-visible:outline-offset-2 [&>*]:pointer-events-none",
								(lifted?.id === m.id || slot?.id === m.id) &&
									"z-10 cursor-grabbing shadow-(--shadow-float) outline-2 outline-highlight outline-solid",
								editing && narrow && "cursor-default"
							)}
							style={placeOf(m.id)}
							onPointerDown={e => down(e, m.id)}
							onPointerMove={move}
							onPointerUp={up}
							onPointerCancel={up}
							onKeyDown={e => keys(e, m.id)}
							onBlur={e => {
								if (lifted?.id === m.id && e.target === e.currentTarget) {
									setMoving(null);
									setLifted(null);
								}
							}}
						>
							{m.node}
						</div>
					))}
			</div>
			{editing ? (
				<div className="flex items-center gap-2 self-center rounded-full bg-fill-quiet py-1 pr-1 pl-4">
					<span className="text-caption text-muted-foreground">
						{narrow
							? "Widen the window to move modules"
							: "Drag a module, or focus one and press Space, then the arrow keys"}
					</span>
					<Button
						size="push"
						variant="pushDefault"
						className="rounded-full"
						onClick={() => {
							setEditing(false);
							setLifted(null);
							say("Home arranged");
						}}
					>
						Done
					</Button>
				</div>
			) : (
				<Popover open={managing} onOpenChange={setManaging}>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="self-center rounded-full bg-fill-quiet">
							<SlidersHorizontal /> Manage modules
						</Button>
					</PopoverTrigger>
					<PopoverContent side="top" variant="menu" className="w-60">
						<div className={menu.header}>Shown on Home</div>
						{modules.map(m => {
							const shown = !hidden.includes(m.id);
							return (
								<MenuItem
									key={m.id}
									checked={shown}
									onClick={() => (shown ? hide(m.id) : add(m.id))}
								>
									{m.name}
								</MenuItem>
							);
						})}
						<div className={menu.separator} />
						<MenuItem
							disabled={narrow}
							onClick={() => {
								setManaging(false);
								setEditing(true);
								say("Moving modules: focus one and press Space, then the arrow keys");
							}}
						>
							Move modules…
						</MenuItem>
						<MenuItem
							onClick={() => {
								setManaging(false);
								reset();
							}}
						>
							Reset layout
						</MenuItem>
					</PopoverContent>
				</Popover>
			)}
			<div ref={live} aria-live="polite" className="sr-only" />
		</div>
	);
}
