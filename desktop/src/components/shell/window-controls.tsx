import { linux } from "@ckpro/ui/lib/platform";
import { cn } from "@ckpro/ui/lib/utils";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { windowApi } from "@/tauri/api";

/**
 * The window's buttons, drawn in the app's own title bar (the window has no
 * frame on Windows and Linux, tauri.*.conf.json): minimise, maximise or
 * restore, and close, at the window's top right, sized as the system draws
 * them. Windows': as tall as the bar, 46px wide, close turning red. Linux's
 * as GNOME draws them: small round buttons a little apart, shaded under the
 * pointer only. On macOS the window's own buttons float over the web view
 */
export function WindowControls() {
	const [maximized, setMaximized] = useState(false);
	// Maximised from the button, a double click on the bar or a snap: the
	// window says so on every resize
	useEffect(() => {
		const read = () => windowApi.isMaximized().then(setMaximized);
		read();
		const stop = windowApi.onResized(read);
		return () => {
			stop.then(fn => fn());
		};
	}, []);

	const button = linux
		? "grid size-6 place-items-center rounded-full text-foreground/80 outline-none transition-colors duration-100 focus-visible:bg-foreground/10 [&_svg]:size-3.5 [&_svg]:stroke-[1.75]"
		: "grid h-full w-[46px] place-items-center text-foreground/80 outline-none transition-colors duration-100 focus-visible:bg-foreground/10 [&_svg]:size-4 [&_svg]:stroke-[1.25]";
	// GNOME's close is shaded as the others are; Windows' turns red
	const close = linux
		? "hover:bg-foreground/10"
		: "hover:bg-window-close hover:text-window-close-foreground";
	return (
		<div className={linux ? "flex items-center gap-2" : "-mr-3 flex h-full self-stretch"}>
			<button
				type="button"
				aria-label="Minimise"
				onClick={() => windowApi.minimize()}
				className={cn(button, "hover:bg-foreground/10")}
			>
				<Minus />
			</button>
			<button
				type="button"
				aria-label={maximized ? "Restore" : "Maximise"}
				onClick={() => windowApi.toggleMaximize()}
				className={cn(
					button,
					"hover:bg-foreground/10",
					linux ? "[&_svg]:size-3" : "[&_svg]:size-3.5"
				)}
			>
				{maximized ? <Copy className="-scale-x-100" /> : <Square />}
			</button>
			<button
				type="button"
				aria-label="Close"
				onClick={() => windowApi.close()}
				className={cn(button, close)}
			>
				<X />
			</button>
		</div>
	);
}
