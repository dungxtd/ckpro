import { command, mac } from "@cktry/ui/lib/platform";

interface Keys {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

/** A shortcut: how the platform writes it, and whether a key press is it */
interface Shortcut {
	label: string;
	is: (e: Keys) => boolean;
}

/**
 * The app's shortcuts, each as macOS apps have it and as Windows apps do
 * (⌘ is Ctrl there; ⌃⌘, which Windows has no pair for, is Ctrl+Shift)
 */
export const SHORTCUTS = {
	settings: {
		label: mac ? "⌘," : "Ctrl+,",
		is: e => command(e) && e.key === ",",
	},
	sidebar: {
		label: mac ? "⌃⌘S" : "Ctrl+Shift+S",
		is: e =>
			(mac ? e.metaKey && e.ctrlKey : e.ctrlKey && e.shiftKey) && e.key.toLowerCase() === "s",
	},
	moveUp: {
		label: mac ? "⌥⌘↑" : "Ctrl+Alt+↑",
		is: e => command(e) && e.altKey && e.key === "ArrowUp",
	},
	moveDown: {
		label: mac ? "⌥⌘↓" : "Ctrl+Alt+↓",
		is: e => command(e) && e.altKey && e.key === "ArrowDown",
	},
} satisfies Record<string, Shortcut>;
