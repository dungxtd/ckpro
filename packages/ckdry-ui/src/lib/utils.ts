import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The app's own theme steps (globals.css). Without them tailwind-merge reads
// `text-lead` as a text colour and drops the real colour next to it
// (`text-black text-lead` lost its `text-black`).
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: ["3xs", "2xs", "caption", "callout", "lead"],
			radius: ["tight", "control", "segment", "poster", "menu", "sheet"],
			"text-shadow": ["caption", "label"],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
