import { mac } from "@cktry/ui/lib/platform";
import { cn } from "@cktry/ui/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";
import { ActivityChip } from "@/components/activity/activity-chip";
import { useInspectorShown } from "@/components/shell/inspector";
import { WindowControls } from "@/components/shell/window-controls";
import { type CapsuleBox, CapsuleNav } from "./capsule-nav";

/** What the capsule keeps clear of on the left: macOS's window buttons */
const LEFT = mac ? 80 : 12;

/**
 * The bar over the content: it moves the window and shows what is running.
 * With the sidebar hidden, the screens float in it as a capsule (centred in
 * the window, clear of the window's buttons and of an inspector); else the
 * screen's name, once its own title scrolled away
 */
export function TitleBar({
	folded,
	title,
	onUnfold,
	onSearch,
	onCapsule,
}: {
	folded: boolean;
	title?: string;
	/** Where the capsule is, which the window's surface takes the shape of while folded */
	onCapsule: (box: CapsuleBox) => void;
	onUnfold: () => void;
	onSearch: () => void;
}) {
	const inspecting = useInspectorShown();
	// The capsule's room: from the window's buttons to what is at the bar's end
	// (what is running, Windows' buttons) or the inspector's edge
	const end = useRef<HTMLDivElement>(null);
	const [right, setRight] = useState(0);
	useLayoutEffect(() => {
		const el = end.current;
		if (!el) return;
		const measure = () => setRight(el.getBoundingClientRect().left - 8);
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(el);
		if (el.parentElement) watch.observe(el.parentElement);
		window.addEventListener("resize", measure);
		return () => {
			watch.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, []);
	return (
		<div
			data-tauri-drag-region
			className="relative flex h-12 shrink-0 items-center justify-end gap-2 px-3"
		>
			<span
				aria-hidden={!title || folded}
				className={cn(
					"pointer-events-none absolute left-1/2 -translate-x-1/2 font-semibold text-callout transition-opacity duration-200",
					title && !folded ? "opacity-100" : "opacity-0"
				)}
			>
				{title}
			</span>
			<CapsuleNav
				folded={folded}
				left={LEFT}
				right={right}
				onUnfold={onUnfold}
				onSearch={onSearch}
				onBox={onCapsule}
			/>
			<div ref={end} className="flex items-center gap-2">
				<ActivityChip compact={folded} />
				{/* Windows' buttons at the window's corner: the inspector's, when one shows */}
				{!mac && !inspecting && <WindowControls />}
			</div>
		</div>
	);
}
