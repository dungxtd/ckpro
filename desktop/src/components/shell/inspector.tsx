import { mac } from "@ckpro/ui/lib/platform";
import { cn } from "@ckpro/ui/lib/utils";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { WindowControls } from "./window-controls";

/** Where a screen's inspector goes (the layout's column at the window's
 * right, the height of the window), whether the window is wide enough for
 * one, and whether one is shown */
interface Slot {
	element: HTMLElement | null;
	wide: boolean;
	shown: boolean;
	setShown: (shown: boolean) => void;
}

const InspectorContext = createContext<Slot>({
	element: null,
	wide: false,
	shown: false,
	setShown: () => {},
});

export const InspectorProvider = InspectorContext.Provider;

/** The width the content and an inspector need together, at least */
export const INSPECTOR_FROM_PX = 768;

/** Whether this window shows an inspector (else a screen lays its panel out inline) */
export const useInspectorFits = () => useContext(InspectorContext).wide;

/** Whether a screen shows one now (the title bar leaves the window's buttons to it) */
export const useInspectorShown = () => useContext(InspectorContext).shown;

/**
 * A screen's panel at the window's right, as tall as the window like the
 * sidebar at its left (a macOS inspector): its top strip moves the window
 * and, on Windows, holds the window's buttons. Rendered into the layout's
 * column; nothing when the window is too narrow (`useInspectorFits`)
 */
export function Inspector({
	top,
	className,
	children,
}: {
	/** What the top strip holds, beside the window's buttons */
	top?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const { element, wide, setShown } = useContext(InspectorContext);
	const on = wide && element !== null;
	useEffect(() => {
		setShown(on);
		return () => setShown(false);
	}, [on, setShown]);
	if (!on) return null;
	return createPortal(
		<aside
			className={cn(
				"flex h-full w-[clamp(18rem,30vw,24rem)] min-w-0 flex-col border-border border-l bg-foreground/[0.015]",
				className
			)}
		>
			<div
				data-tauri-drag-region
				className="flex h-12 shrink-0 select-none items-center gap-2 px-4"
			>
				<div className="flex min-w-0 flex-1 items-center gap-2">{top}</div>
				{!mac && <WindowControls />}
			</div>
			{children}
		</aside>,
		element
	);
}

/** The layout's state for the inspector column: its element (a ref to set),
 * and whether it is shown; `wide` is the layout's to say */
export function useInspectorSlot(wide: boolean) {
	const [element, setElement] = useState<HTMLElement | null>(null);
	const [shown, setShown] = useState(false);
	return { slot: { element, wide, shown, setShown }, ref: setElement };
}
