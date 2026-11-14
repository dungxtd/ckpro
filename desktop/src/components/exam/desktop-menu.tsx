import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { MenuItem, menu } from "@ckpro/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { Stepper } from "@ckpro/ui/components/stepper";
import { cn } from "@ckpro/ui/lib/utils";
import { RotateCcw, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSettings } from "@/stores/settings";
import { desktopApi, errorText } from "@/tauri/api";

export const RESOLUTIONS: [number, number][] = [
	[1280, 800],
	[1366, 768],
	[1600, 900],
	[1920, 1080],
];

/** The ExamUI's +/-: how much larger the desktop is drawn */
const ZOOMS = [1, 1.25, 1.5, 1.75, 2];

/** The desktop's size and resolution, kept in the settings */
export function useDesktopSettings(): DesktopMenuProps {
	const update = useSettings(s => s.update);
	const desktopZoom = useSettings(s => s.settings.desktop_zoom);
	const desktopResolution = useSettings(s => s.settings.desktop_resolution);
	const zoom = ZOOMS.find(z => z === desktopZoom) ?? 1;
	const at = ZOOMS.indexOf(zoom);
	return {
		zoom,
		canZoomOut: at > 0,
		canZoomIn: at < ZOOMS.length - 1,
		onZoom: step =>
			update({ desktop_zoom: ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + step))] ?? 1 }),
		resolution: desktopResolution ?? null,
		onResolution: resolution => update({ desktop_resolution: resolution }),
	};
}

export interface DesktopMenuProps {
	/** How much larger the desktop is drawn (the ExamUI's +/-) */
	zoom: number;
	canZoomOut: boolean;
	canZoomIn: boolean;
	onZoom: (step: -1 | 1) => void;
	resolution: [number, number] | null;
	onResolution: (resolution: [number, number] | null) => void;
}

/**
 * The remote desktop's menu (the ExamUI's cogwheel), everything about the
 * desktop in one place: its size (+/-), fit to the screen or a custom
 * resolution, and reset.
 */
export function DesktopMenu({
	zoom,
	canZoomOut,
	canZoomIn,
	onZoom,
	resolution,
	onResolution,
}: DesktopMenuProps) {
	const [resetting, setResetting] = useState(false);
	// Resetting closes whatever the candidate has open on it: asked first
	const [confirming, setConfirming] = useState(false);
	const option = (label: string, value: [number, number] | null) => {
		const active = value === null ? resolution === null : resolution?.join() === value.join();
		return (
			<MenuItem key={label} checked={active} onClick={() => onResolution(value)}>
				{label}
			</MenuItem>
		);
	};
	const reset = async () => {
		setResetting(true);
		try {
			await desktopApi.reset();
			toast("The desktop restarted: its windows were closed");
		} catch (e) {
			toast.error(`Could not reset the desktop: ${errorText(e)}`);
		} finally {
			setResetting(false);
		}
	};

	return (
		<>
			<Popover>
				<PopoverTrigger asChild>
					<IconButton variant="plain" size="bar" aria-label="Desktop settings">
						<Settings />
					</IconButton>
				</PopoverTrigger>
				{/* A panel of controls (a stepper among them), not a menu: Tab moves
			    through it */}
				<PopoverContent align="end" aria-label="Desktop settings" variant="menu" className="w-60">
					<div className={menu.header}>Remote desktop</div>
					<div className={cn(menu.content, "flex items-center justify-between py-1 text-callout")}>
						Size
						<Stepper
							label="Desktop size"
							value={`${Math.round(zoom * 100)}%`}
							onDecrement={() => onZoom(-1)}
							onIncrement={() => onZoom(1)}
							decrementDisabled={!canZoomOut}
							incrementDisabled={!canZoomIn}
						/>
					</div>
					<div className={menu.separator} />
					{option("Fit to screen", null)}
					<div className={menu.header}>Custom resolution</div>
					{RESOLUTIONS.map(([w, h]) => option(`${w} × ${h}`, [w, h]))}
					<div className={menu.separator} />
					<MenuItem
						icon={<RotateCcw />}
						disabled={resetting}
						data-disabled={resetting || undefined}
						onClick={() => setConfirming(true)}
					>
						{resetting ? "Resetting…" : "Reset desktop…"}
					</MenuItem>
				</PopoverContent>
			</Popover>
			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title="Reset the desktop?"
				description="Its open windows close."
				action="Reset"
				onConfirm={reset}
			/>
		</>
	);
}
