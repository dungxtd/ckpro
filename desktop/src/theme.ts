import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useSettings } from "@/stores/settings";

/**
 * The app in the theme the settings pick: light, dark, or as macOS is
 * (following it when it changes). The window takes it too, so its title bar
 * buttons and menus match
 */
export function useTheme() {
	const theme = useSettings(s => s.settings.theme);
	useEffect(() => {
		const dark = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			document.documentElement.dataset.theme =
				theme === "dark" || (theme === "system" && dark.matches) ? "dark" : "light";
		};
		apply();
		getCurrentWindow()
			.setTheme(theme === "system" ? null : theme)
			.catch(e => console.error("setting the window theme", e));
		if (theme !== "system") return;
		dark.addEventListener("change", apply);
		return () => dark.removeEventListener("change", apply);
	}, [theme]);
}
