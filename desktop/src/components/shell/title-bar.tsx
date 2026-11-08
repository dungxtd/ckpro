import { useElementSize } from "@cktry/ui/hooks/use-element-size";
import { mac } from "@cktry/ui/lib/platform";
import { cn } from "@cktry/ui/lib/utils";
import type * as React from "react";
import { ActivityChip } from "@/components/activity/activity-chip";
import { useInspectorShown } from "@/components/shell/inspector";
import { WindowControls } from "@/components/shell/window-controls";
import { CapsuleNav } from "./capsule-nav";

/**
 * The bar over the content: it moves the window and shows what is running.
 * With the sidebar hidden, the screens float in it as a capsule (centred in
 * the window, clear of the window's buttons, of what ends the bar and of an
 * inspector: placed by CSS); else the screen's name, once its own title
 * scrolled away
 */
export function TitleBar({
	folded,
	title,
	onUnfold,
	onSearch,
	capsuleRef,
}: {
	folded: boolean;
	title?: string;
	/** The capsule, whose box the window's surface takes as it morphs */
	capsuleRef: React.Ref<HTMLElement>;
	onUnfold: () => void;
	onSearch: () => void;
}) {
	const inspecting = useInspectorShown();
	// What ends the bar (what is running, Windows' buttons): the capsule keeps
	// clear of it
	const [end, { width: endWidth }] = useElementSize<HTMLDivElement>({ border: true });
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
				ref={capsuleRef}
				folded={folded}
				clear={endWidth}
				onUnfold={onUnfold}
				onSearch={onSearch}
			/>
			{/* As tall as the bar: Windows' buttons fill it */}
			<div ref={end} className="flex items-center gap-2 self-stretch">
				<ActivityChip compact={folded} />
				{/* Windows' buttons at the window's corner: the inspector's, when one shows */}
				{!mac && !inspecting && <WindowControls />}
			</div>
		</div>
	);
}
