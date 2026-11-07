import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckpro/ui/components/select";
import { Stepper } from "@ckpro/ui/components/stepper";
import { Monitor, Type, ZoomIn } from "lucide-react";
import { RESOLUTIONS, useDesktopSettings } from "@/components/exam/desktop-menu";
import { TextSize } from "@/components/exam/question-panel";
import { Group, Row } from "@/components/settings/layout";

export function DeskSettings() {
	const desktop = useDesktopSettings();
	const resolution = desktop.resolution ? desktop.resolution.join("x") : "fit";
	return (
		<Group description="Also changed from the desk itself, as on the exam.">
			<Row icon={<Type />} label="Question text size">
				<TextSize />
			</Row>
			<Row icon={<ZoomIn />} label="Desktop size">
				<Stepper
					label="Desktop size"
					value={`${Math.round(desktop.zoom * 100)}%`}
					onDecrement={() => desktop.onZoom(-1)}
					onIncrement={() => desktop.onZoom(1)}
					decrementDisabled={!desktop.canZoomOut}
					incrementDisabled={!desktop.canZoomIn}
				/>
			</Row>
			<Row icon={<Monitor />} label="Desktop resolution">
				<Select
					value={resolution}
					onValueChange={value =>
						desktop.onResolution(
							value === "fit" ? null : (value.split("x").map(Number) as [number, number])
						)
					}
				>
					<SelectTrigger aria-label="Desktop resolution">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="fit">Fit to screen</SelectItem>
						{RESOLUTIONS.map(([w, h]) => (
							<SelectItem key={`${w}x${h}`} value={`${w}x${h}`}>
								{w} × {h}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>
		</Group>
	);
}
