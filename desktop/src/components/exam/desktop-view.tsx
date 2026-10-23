import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import { desktopApi } from "@/tauri/api";

/** noVNC internals the HiDPI resize hooks into (no public API for it) */
type Internals = {
	_requestRemoteResize(): void;
	_screenSize(): { w: number; h: number };
};

/**
 * The exam's remote desktop (the `base` machine), over VNC. The desktop
 * takes the panel's size in device pixels and is drawn scaled to fit, so it
 * is sharp on HiDPI screens and as roomy as the exam's; `zoom` makes it
 * larger (the ExamUI's +/-). Reconnects when the desktop restarts (starting
 * up, the app reopened mid-exam). Text copied in the app, e.g. from the
 * question, lands on the desktop's clipboard.
 */
export function DesktopView({ zoom }: { zoom: number }) {
	const screen = useRef<HTMLDivElement>(null);
	const rfbRef = useRef<RFB | null>(null);
	const zoomRef = useRef(zoom);
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
			// Ask for the panel's size in device pixels (divided by the zoom);
			// scaleViewport then draws it into the panel
			const internals = rfb as unknown as Internals;
			const request = internals._requestRemoteResize.bind(rfb);
			const screenSize = internals._screenSize.bind(rfb);
			internals._requestRemoteResize = () => {
				const factor = (window.devicePixelRatio || 1) / zoomRef.current;
				internals._screenSize = () => {
					const size = screenSize();
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
			rfb.addEventListener("connect", () => {
				setConnected(true);
				rfb.focus();
			});
			rfb.addEventListener("disconnect", () => {
				setConnected(false);
				rfbRef.current = null;
				if (!stopped) retry = setTimeout(connect, 1000);
			});
		};

		const onCopy = () => {
			const text = document.getSelection()?.toString();
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

	// A new zoom: ask the desktop for its new size
	useEffect(() => {
		zoomRef.current = zoom;
		const rfb = rfbRef.current as unknown as Internals | null;
		rfb?._requestRemoteResize();
	}, [zoom]);

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
