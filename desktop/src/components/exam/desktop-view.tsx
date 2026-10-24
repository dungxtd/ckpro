import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import { desktopApi } from "@/tauri/api";

/** noVNC internals the HiDPI resize hooks into (no public API for it) */
type Internals = {
	_screen: HTMLElement;
	_requestRemoteResize(): void;
	_screenSize(): { w: number; h: number };
};

/**
 * The exam's remote desktop (the `base` machine), over VNC. The desktop
 * takes the panel's size in device pixels and is drawn scaled to fit, so it
 * is sharp on HiDPI screens and as roomy as the exam's, or takes a fixed
 * `resolution` (the ExamUI's "custom resolution"), drawn to fit; `zoom`
 * makes it larger (the ExamUI's +/-). Reconnects when the desktop restarts (starting
 * up, the app reopened mid-exam). Text copied in the app, e.g. from the
 * question, lands on the desktop's clipboard.
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
			internals._requestRemoteResize = () => {
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
			});
			rfb.addEventListener("disconnect", () => {
				setConnected(false);
				rfbRef.current = null;
				if (!stopped) retry = setTimeout(connect, 1000);
			});
		};

		const onCopy = () => {
			// Without the line break a triple-click selects after a one-line
			// command: the terminal would hold it behind its "unsafe paste" warning
			const text = document.getSelection()?.toString().replace(/\r?\n+$/, "");
			if (text) rfbRef.current?.clipboardPasteFrom(text);
		};

		connect();
		document.addEventListener("copy", onCopy);
		return () => {
			stopped = true;
			clearTimeout(retry);
			document.removeEventListener("copy", onCopy);
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
		<div className="relative h-full w-full bg-[#1e1e1e]">
			<div ref={screen} className="h-full w-full" />
			{!connected && (
				<div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
					Connecting to the exam desktop…
				</div>
			)}
		</div>
	);
}
