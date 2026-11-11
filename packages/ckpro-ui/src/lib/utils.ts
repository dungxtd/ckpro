import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The app's own theme steps (globals.css). Without them tailwind-merge reads
// `text-lead` as a text colour and drops the real colour next to it
// (`text-black text-lead` lost its `text-black`).
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: ["3xs", "2xs", "caption", "callout", "lead", "title", "display"],
			radius: ["toast", "sheet"],
			"text-shadow": ["caption", "label"],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Height of the strip along the window's top edge floating surfaces stay out
 * of (macOS: the window buttons float over the web view; 0 elsewhere) */
export function titlebarHeight(): number {
	if (typeof document === "undefined") return 0;
	const value = getComputedStyle(document.documentElement).getPropertyValue("--titlebar-h");
	return Number.parseFloat(value) || 0;
}

/** The room floating surfaces keep from the window's edges, the title bar's strip included */
export const floatingPadding = () => ({ top: titlebarHeight() + 4, left: 8, right: 8, bottom: 8 });
