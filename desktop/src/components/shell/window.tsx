import { mac } from "@cktry/ui/lib/platform";
import type { ReactNode } from "react";
import { WindowControls } from "@/components/shell/window-controls";

/**
 * A screen of the whole window, under a bar that moves the window (the title
 * bar is hidden: on macOS its buttons sit over this one, on Windows the bar
 * draws them)
 */
export function WindowFrame({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full flex-col bg-background">
			<div data-tauri-drag-region className="flex h-12 shrink-0 justify-end pr-3">
				{!mac && <WindowControls />}
			</div>
			<div className="min-h-0 flex-1">{children}</div>
		</div>
	);
}
