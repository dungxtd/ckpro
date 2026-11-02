import * as React from "react";

type Theme = "light" | "dark";

const ThemeScopeContext = React.createContext<Theme | undefined>(undefined);

/** Forces a theme on a subtree (an always-dark area). Portaled kit
 * content (menus, popovers, sheets, dialogs) reads it via `useThemeScope`, so
 * a menu opened inside the subtree matches it instead of the page theme. */
export function ThemeScope({ theme, children }: { theme: Theme; children: React.ReactNode }) {
	return (
		<ThemeScopeContext.Provider value={theme}>
			<div data-theme={theme} className="contents">
				{children}
			</div>
		</ThemeScopeContext.Provider>
	);
}

/** Theme forced by the nearest `ThemeScope`, or undefined (page theme). */
export function useThemeScope(): Theme | undefined {
	return React.useContext(ThemeScopeContext);
}
