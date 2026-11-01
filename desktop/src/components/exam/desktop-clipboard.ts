/** The last text clicked to copy, and the connected desktop it goes to */
let clipboard = "";
let deliver: ((text: string) => void) | null = null;

/**
 * Put text on the exam desktop's clipboard. As on the exam, the only way in:
 * the host's clipboard and text selected in the app never reach the desktop
 */
export function copyToDesktop(text: string) {
	clipboard = text;
	deliver?.(text);
}

/** The desktop connected (it gets what was copied meanwhile), or went away (null) */
export function connectClipboard(next: ((text: string) => void) | null) {
	deliver = next;
	if (next && clipboard) next(clipboard);
}
