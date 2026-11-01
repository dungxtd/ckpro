import { Loading } from "@ckpro/ui/components/loading";
import { useDismissSurface } from "@ckpro/ui/components/popover";
import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import { connectClipboard } from "@/components/exam/desktop-clipboard";
import { desktopApi } from "@/tauri/api";

/** noVNC internals the HiDPI resize hooks into (no public API for it) */
type Internals = {
	_screen: HTMLElement;
	_canvas: HTMLCanvasElement;
	_requestRemoteResize(): void;
	_screenSize(): { w: number; h: number };
	_sendMouse(x: number, y: number, mask: number): void;
};

/** The element noVNC routes a press's events through while it lasts */
const CAPTURE_ID = "noVNC_mouse_capture_elem";

/** The right button in the desktop's pointer events */
const RIGHT_BUTTON = 4;

/** How long resizing must have stopped before the desktop takes the new size */
const RESIZE_SETTLE_MS = 400;

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
	// noVNC hands a press's later events (the release) to an element of its
	// own over the whole page: the desktop too, for menus to close on a press
	const captureSurface = useDismissSurface();

	// biome-ignore lint/correctness/useExhaustiveDependencies: connects once; the surface setter is stable
	useEffect(() => {
		let retry: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;

		const connect = async () => {
			if (stopped || !screen.current) return;
			const session = await desktopApi.session().catch(() => null);
			// Closed while it was asked for: nothing to connect, nothing to retry
			if (stopped || !screen.current) return;
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
			// A right click the web view reports only as a context menu (a trackpad's
			// two-finger tap, a click with the Control key held) still reaches the
			// desktop as one, as on the exam's remote desktop
			let rightDown = false;
			internals._canvas.addEventListener(
				"mousedown",
				e => (rightDown = (e.buttons & 2) !== 0),
				true
			);
			internals._canvas.addEventListener(
				"contextmenu",
				e => {
					if (rightDown) return;
					const box = internals._canvas.getBoundingClientRect();
					const x = e.clientX - box.left;
					const y = e.clientY - box.top;
					// Undo the left press a Control-click sent first
					internals._sendMouse(x, y, 0);
					internals._sendMouse(x, y, RIGHT_BUTTON);
					internals._sendMouse(x, y, 0);
				},
				true
			);
			rfb.resizeSession = true;
			rfb.scaleViewport = true;
			rfb.focusOnClick = true;
			rfb.background = getComputedStyle(document.documentElement).getPropertyValue(
				"--color-desktop"
			);
			// Light zlib: without it the web view takes about twelve times the
			// data and decodes it on the thread that also draws (measured: a
			// terminal printing for 8 s, 55 MB against 5 MB, about half the
			// browser's CPU); the desktop's side costs the same. Sharp text
			// and images
			rfb.compressionLevel = 2;
			rfb.qualityLevel = 8;
			rfb.addEventListener("connect", () => {
				setConnected(true);
				// Without preventScroll the browser scrolls the page to the canvas,
				// shifting the whole exam desk out of the window
				rfb.focus({ preventScroll: true });
				// Copied while it was (re)connecting
				connectClipboard(text => rfb.clipboardPasteFrom(text));
				// That element is made on the first press; made now, view only
				// meanwhile so the desktop gets nothing
				if (!document.getElementById(CAPTURE_ID)) {
					rfb.viewOnly = true;
					internals._canvas.dispatchEvent(new MouseEvent("mousedown", { buttons: 1 }));
					window.dispatchEvent(new MouseEvent("mouseup"));
					rfb.viewOnly = false;
				}
				captureSurface(document.getElementById(CAPTURE_ID) as HTMLDivElement | null);
			});
			rfb.addEventListener("disconnect", () => {
				setConnected(false);
				rfbRef.current = null;
				connectClipboard(null);
				if (!stopped) retry = setTimeout(connect, 1000);
			});
		};

		connect();
		return () => {
			stopped = true;
			clearTimeout(retry);
			connectClipboard(null);
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
		<div ref={surface} className="relative h-full w-full bg-desktop">
			<div ref={screen} className="h-full w-full" />
			{!connected && (
				<div className="absolute inset-0">
					<Loading fill label="Connecting to the exam desktop…" />
				</div>
			)}
		</div>
	);
}
