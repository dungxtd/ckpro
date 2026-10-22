import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { terminalApi } from "@/tauri/api";

const decode = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** Interactive shell in a container; reopens when `container` or `session` changes. */
export function TerminalView({ container, session }: { container: string; session: number }) {
	const host = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!host.current || session === 0) return;
		const term = new Terminal({
			fontSize: 13,
			cursorBlink: true,
			fontFamily: "ui-monospace, Menlo, monospace",
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(host.current);
		try {
			term.loadAddon(new WebglAddon());
		} catch {
			// canvas renderer fallback
		}
		fit.fit();

		let id: string | null = null;
		let disposed = false;
		const resize = () => {
			fit.fit();
			if (id) terminalApi.resize(id, term.cols, term.rows).catch(() => {});
		};
		const observer = new ResizeObserver(resize);
		observer.observe(host.current);
		const input = term.onData(data => {
			if (id) terminalApi.write(id, data).catch(() => {});
		});

		terminalApi
			.open(container, event => {
				if (event.kind === "output") term.write(decode(event.data));
				else term.write("\r\n\x1b[2m[session closed]\x1b[0m\r\n");
			})
			.then(sessionId => {
				if (disposed) {
					terminalApi.close(sessionId).catch(() => {});
					return;
				}
				id = sessionId;
				resize();
				term.focus();
			})
			.catch(e => term.write(`\x1b[31m${e instanceof Error ? e.message : e}\x1b[0m\r\n`));

		return () => {
			disposed = true;
			observer.disconnect();
			input.dispose();
			if (id) terminalApi.close(id).catch(() => {});
			term.dispose();
		};
	}, [container, session]);

	return <div ref={host} className="h-full w-full overflow-hidden rounded-md bg-black p-1" />;
}
