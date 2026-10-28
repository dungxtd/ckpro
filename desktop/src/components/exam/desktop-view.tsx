import { useDismissSurface } from "@ckdry/ui/components/popover";
import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import { desktopApi } from "@/tauri/api";

/** noVNC internals the HiDPI resize hooks into (no public API for it) */
type Internals = {
	_screen: HTMLElement;
	_requestRemoteResize(): void;
	_screenSize(): { w: number; h: number };
};

/** How long resizing must have stopped before the desktop takes the new size */
const RESIZE_SETTLE_MS = 400;

/** The last text clicked to copy, and the connected desktop it goes to */
let clipboard = "";
let deliver: ((text: string) => void) | null = null;

/**
 * Put text on the desktop's clipboard. As on the exam, the only way in: the
 * host's clipboard and text selected in the app never reach the desktop
 */
export function copyToDesktop(text: string) {
	clipboard = text;
	deliver?.(text);
}

/**
 * The exam's remote desktop (the `base` machine), over VNC. The desktop
 * takes the panel's size in device pixels and is drawn scaled to fit, so it
 * is sharp on HiDPI screens and as roomy as the exam's, or takes a fixed
 * `resolution` (the ExamUI's "custom resolution"), drawn to fit; `zoom`
 * makes it larger (the ExamUI's +/-). Reconnects when the desktop restarts (starting
 * up, the app reopened mid-exam). Only what `copyToDesktop` gets (the
 * question's click-to-copy values) lands on the desktop's clipboard.
 */
export function DesktopView({
	zoom,
	resolution,
}: {
	zoom: number;
	resolution: [number, number] | null;
}) {
	const screen = useRef<HTMLDivElement>(null);
	const rfbRef = useRef<RFB | null>(null);
	const zoomRef = useRef(zoom);
	const resolutionRef = useRef(resolution);
	const [connected, setConnected] = useState(false);
	// noVNC stops its canvas's mouse events: a press on it still closes menus
	const surface = useDismissSurface();

	useEffect(() => {
		let retry: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;

		const connect = async () => {
			if (stopped || !screen.current) return;
			const session = await desktopApi.session().catch(() => null);
			if (!session) {
				retry = setTimeout(connect, 1000);
				return;
			}
			const rfb = new RFB(screen.current, `ws://127.0.0.1:${session.port}`, {
				credentials: { password: session.password },
			});
			rfbRef.current = rfb;
			// Ask for the panel's size in device pixels, or the fixed resolution,
			// divided by the zoom; scaleViewport then draws it into the panel
			const internals = rfb as unknown as Internals;
			// noVNC scrolls its screen when the scaled desktop is a pixel too
			// big; it is always drawn to fit, so it never needs to
			internals._screen.style.overflow = "hidden";
			const request = internals._requestRemoteResize.bind(rfb);
			const screenSize = internals._screenSize.bind(rfb);
			// noVNC asks every 100 ms while the window or a panel is dragged, and
			// the desktop lays itself out again each time (it jumps, and can end
			// up drawn in a corner). The picture scales locally meanwhile; the
			// desktop gets one new size once the resizing has stopped
			let settle: ReturnType<typeof setTimeout> | undefined;
			internals._requestRemoteResize = () => {
				clearTimeout(settle);
				settle = setTimeout(resize, RESIZE_SETTLE_MS);
			};
			const resize = () => {
				if (rfbRef.current !== rfb) return;
				const fixed = resolutionRef.current;
				const dpr = window.devicePixelRatio || 1;
				internals._screenSize = () => {
					const size = fixed ? { w: fixed[0], h: fixed[1] } : screenSize();
					const factor = (fixed ? 1 : dpr) / zoomRef.current;
					return { w: Math.round(size.w * factor), h: Math.round(size.h * factor) };
				};
				try {
					request();
				} finally {
					internals._screenSize = screenSize;
				}
			};
			rfb.resizeSession = true;
			rfb.scaleViewport = true;
			rfb.focusOnClick = true;
			rfb.background = "#1e1e1e";
			// Local only (127.0.0.1): bandwidth is free, CPU is not. No zlib
			// work on either side, and sharp text and images
			rfb.compressionLevel = 0;
			rfb.qualityLevel = 8;
			rfb.addEventListener("connect", () => {
				setConnected(true);
				// Without preventScroll the browser scrolls the page to the canvas,
				// shifting the whole exam desk out of the window
				rfb.focus({ preventScroll: true });
				// Copied while it was (re)connecting
				deliver = text => rfb.clipboardPasteFrom(text);
				if (clipboard) deliver(clipboard);
			});
			rfb.addEventListener("disconnect", () => {
				setConnected(false);
				rfbRef.current = null;
				deliver = null;
				if (!stopped) retry = setTimeout(connect, 1000);
			});
		};

		connect();
		return () => {
			stopped = true;
			clearTimeout(retry);
			deliver = null;
			rfbRef.current?.disconnect();
		};
	}, []);

	// A new zoom or resolution: ask the desktop for its new size
	useEffect(() => {
		zoomRef.current = zoom;
		resolutionRef.current = resolution;
		const rfb = rfbRef.current as unknown as Internals | null;
		rfb?._requestRemoteResize();
	}, [zoom, resolution]);

	return (
		<div ref={surface} className="relative h-full w-full bg-[#1e1e1e]">
			<div ref={screen} className="h-full w-full" />
			{!connected && (
				<div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
					Connecting to the exam desktop…
				</div>
			)}
		</div>
	);
}
