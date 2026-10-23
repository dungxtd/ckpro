import { Button } from "@ckdry/ui/components/button";
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
				className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
				onClick={() => onResolution(value)}
			>
				<Check className={cn("size-4", !active && "invisible")} />
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
				<Button size="sm" variant="ghost" title="Settings">
					<Settings className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64">
				<div className="px-2 pb-1 text-muted-foreground text-xs">Remote Desktop</div>
				{option("Fit to screen", null)}
				<div className="px-2 pt-2 pb-1 text-muted-foreground text-xs">Custom resolution</div>
				{RESOLUTIONS.map(([w, h]) => option(`${w} × ${h}`, [w, h]))}
				<div className="mt-2 border-border border-t pt-2">
					<Button
						size="sm"
						variant="ghost"
						className="w-full justify-start"
						disabled={resetting}
						onClick={reset}
					>
						<RotateCcw className="size-4" /> {resetting ? "Resetting…" : "Reset desktop"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
