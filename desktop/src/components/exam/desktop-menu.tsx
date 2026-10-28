import { IconButton } from "@ckdry/ui/components/icon-button";
import { menu, menuRow } from "@ckdry/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckdry/ui/components/popover";
import { Stepper } from "@ckdry/ui/components/stepper";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, RotateCcw, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSettings } from "@/stores/settings";
import { desktopApi } from "@/tauri/api";

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
	const { settings, update } = useSettings();
	const zoom = ZOOMS.find(z => z === settings.desktop_zoom) ?? 1;
	const at = ZOOMS.indexOf(zoom);
	return {
		zoom,
		canZoomOut: at > 0,
		canZoomIn: at < ZOOMS.length - 1,
		onZoom: step =>
			update({ desktop_zoom: ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + step))] ?? 1 }),
		resolution: settings.desktop_resolution ?? null,
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
				<IconButton variant="plain" size="sm" className="size-7" aria-label="Desktop settings">
					<Settings />
				</IconButton>
			</PopoverTrigger>
			<PopoverContent align="end" role="menu" className={cn(menu.surface, "w-60")}>
				<div className={menu.header}>Remote Desktop</div>
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
