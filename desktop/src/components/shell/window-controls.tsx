import { cn } from "@cktry/ui/lib/utils";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { windowApi } from "@/tauri/api";

/**
 * Windows' caption buttons, drawn in the app's own title bar (the window has
 * no frame there, tauri.windows.conf.json): minimise, maximise or restore,
 * and close, as wide as Windows draws them, at the window's top right. On
 * macOS the window's own buttons float over the web view instead
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

	const button =
		"grid h-full w-[46px] place-items-center text-foreground/80 outline-none transition-colors duration-100 focus-visible:bg-foreground/10 [&_svg]:size-4 [&_svg]:stroke-[1.25]";
	return (
		<div className="-mr-3 flex h-full self-stretch">
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
				className={cn(button, "hover:bg-foreground/10 [&_svg]:size-3.5")}
			>
				{maximized ? <Copy className="-scale-x-100" /> : <Square />}
			</button>
			<button
				type="button"
				aria-label="Close"
				onClick={() => windowApi.close()}
				className={cn(button, "hover:bg-window-close hover:text-window-close-foreground")}
			>
				<X />
			</button>
		</div>
	);
}
