// The parts of noVNC's RFB client the exam desktop uses (the package ships no types)
declare module "@novnc/novnc" {
	export default class RFB extends EventTarget {
		constructor(
			target: HTMLElement,
			url: string,
			options?: { credentials?: { password?: string } }
		);
		/** Ask the server to resize the remote screen to the element */
		resizeSession: boolean;
		scaleViewport: boolean;
		clipViewport: boolean;
		focusOnClick: boolean;
		viewOnly: boolean;
		background: string;
		/** JPEG quality for photo-like areas, 0-9 */
		qualityLevel: number;
		/** zlib compression, 0 (fastest) to 9 */
		compressionLevel: number;
		disconnect(): void;
		focus(options?: FocusOptions): void;
		/** Put text on the remote clipboard */
		clipboardPasteFrom(text: string): void;
	}
}
