import { IconButton } from "@ckdry/ui/components/icon-button";
import { menu, menuRow } from "@ckdry/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckdry/ui/components/popover";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, RotateCcw, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { desktopApi } from "@/tauri/api";

export const RESOLUTIONS: [number, number][] = [
	[1280, 800],
	[1366, 768],
	[1600, 900],
	[1920, 1080],
];

/**
 * The ExamUI's settings (cogwheel): fit the remote desktop to the screen, set
 * a custom resolution, or reset the desktop.
 */
export function ExamSettings({
	resolution,
	onResolution,
}: {
	resolution: [number, number] | null;
	onResolution: (resolution: [number, number] | null) => void;
}) {
	const [resetting, setResetting] = useState(false);
	const option = (label: string, value: [number, number] | null) => {
		const active = value === null ? resolution === null : resolution?.join() === value.join();
		return (
			<button
				key={label}
				type="button"
				role="menuitemradio"
				aria-checked={active}
				className={menuRow()}
				onClick={() => onResolution(value)}
			>
				{active && (
					<span className={menu.check}>
						<Check className="size-3" strokeWidth={3} />
					</span>
				)}
				{label}
			</button>
		);
	};
	const reset = async () => {
		setResetting(true);
		try {
			await desktopApi.reset();
			toast("The desktop restarted: its windows were closed");
		} catch (e) {
			toast.error(`Could not reset the desktop: ${e}`);
		} finally {
			setResetting(false);
		}
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<IconButton variant="plain" size="sm" className="size-7" aria-label="Settings">
					<Settings />
				</IconButton>
			</PopoverTrigger>
			<PopoverContent align="end" role="menu" className={cn(menu.surface, "w-56")}>
				<div className={menu.header}>Remote Desktop</div>
				{option("Fit to screen", null)}
				<div className={menu.header}>Custom resolution</div>
				{RESOLUTIONS.map(([w, h]) => option(`${w} × ${h}`, [w, h]))}
				<div className={menu.separator} />
				<button
					type="button"
					role="menuitem"
					className={menuRow()}
					disabled={resetting}
					data-disabled={resetting || undefined}
					onClick={reset}
				>
					<span className={menu.check}>
						<RotateCcw className="size-3" />
					</span>
					{resetting ? "Resetting…" : "Reset desktop"}
				</button>
			</PopoverContent>
		</Popover>
	);
}
