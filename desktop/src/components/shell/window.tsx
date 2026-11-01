import type { ReactNode } from "react";

/**
 * A screen of the whole window, under a bar that moves the window (the title
 * bar is hidden; its buttons sit over this one)
 */
export function WindowFrame({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full flex-col bg-background">
			<div data-tauri-drag-region className="h-12 shrink-0" />
			<div className="min-h-0 flex-1">{children}</div>
		</div>
	);
}
