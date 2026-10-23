import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import { desktopApi } from "@/tauri/api";

/**
 * The exam's remote desktop (the `base` machine), over VNC. It takes the
 * panel's size, like the exam's, and reconnects when the desktop restarts
 * (starting up, the app reopened mid-exam). Text copied in the app, e.g.
 * from the question, lands on the desktop's clipboard.
 */
export function DesktopView() {
	const screen = useRef<HTMLDivElement>(null);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		let rfb: RFB | null = null;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;

		const connect = async () => {
			if (stopped || !screen.current) return;
			const session = await desktopApi.session().catch(() => null);
			if (!session) {
				retry = setTimeout(connect, 1000);
				return;
			}
			rfb = new RFB(screen.current, `ws://127.0.0.1:${session.port}`, {
				credentials: { password: session.password },
			});
			rfb.resizeSession = true;
			rfb.scaleViewport = false;
			rfb.focusOnClick = true;
			rfb.background = "#1e1e1e";
			rfb.addEventListener("connect", () => {
				setConnected(true);
				rfb?.focus();
			});
			rfb.addEventListener("disconnect", () => {
				setConnected(false);
				rfb = null;
				if (!stopped) retry = setTimeout(connect, 1000);
			});
		};

		const onCopy = () => {
			const text = document.getSelection()?.toString();
			if (text) rfb?.clipboardPasteFrom(text);
		};

		connect();
		document.addEventListener("copy", onCopy);
		return () => {
			stopped = true;
			clearTimeout(retry);
			document.removeEventListener("copy", onCopy);
			rfb?.disconnect();
		};
	}, []);

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
