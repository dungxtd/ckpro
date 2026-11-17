import { reducedMotion } from "@ckpro/ui/lib/motion";
import { useEffect } from "react";
import { flushSync } from "react-dom";
import { useSettings } from "@/stores/settings";
import { type Theme, windowApi } from "@/tauri/api";

const DARK = "(prefers-color-scheme: dark)";

/** Whether `theme` looks dark now ("system": as the system is) */
const looksDark = (theme: Theme) =>
	theme === "dark" || (theme === "system" && window.matchMedia(DARK).matches);

/** The interface in `theme`'s look */
const show = (theme: Theme) => {
	document.documentElement.dataset.theme = looksDark(theme) ? "dark" : "light";
};

/**
 * The app in the theme the settings pick: light, dark, or as macOS is
 * (following it when it changes). The window takes it too, so its title bar
 * buttons and menus match
 */
export function useTheme() {
	const theme = useSettings(s => s.settings.theme);
	useEffect(() => {
		const apply = () => show(theme);
		apply();
		windowApi
			.setTheme(theme === "system" ? null : theme)
			.catch(e => console.error("setting the window theme", e));
		if (theme !== "system") return;
		const dark = window.matchMedia(DARK);
		dark.addEventListener("change", apply);
		return () => dark.removeEventListener("change", apply);
	}, [theme]);
}

/**
 * `theme` picked (and kept). When the look changes, the new one spreads from
 * `from` (where it was picked, in the window) as a circle over the old;
 * at once with reduced motion or where the webview has no view transitions
 */
export function pickTheme(theme: Theme, from: { x: number; y: number }) {
	const keep = () => useSettings.getState().update({ theme });
	const changes = looksDark(theme) !== (document.documentElement.dataset.theme === "dark");
	if (!changes || !document.startViewTransition || reducedMotion()) return keep();
	// The circle grows to the window's farthest corner
	const reach = Math.hypot(
		Math.max(from.x, window.innerWidth - from.x),
		Math.max(from.y, window.innerHeight - from.y)
	);
	const root = document.documentElement.style;
	root.setProperty("--reveal-x", `${from.x}px`);
	root.setProperty("--reveal-y", `${from.y}px`);
	root.setProperty("--reveal-r", `${reach}px`);
	document.startViewTransition(() => {
		show(theme);
		// The picker marks its choice in the new look, not after it
		flushSync(keep);
	});
}
