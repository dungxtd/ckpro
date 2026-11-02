import { cn } from "@cktry/ui/lib/utils";
import type * as React from "react";

type RangeProps = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
	value: number;
	min: number;
	max: number;
	onValueChange: (value: number) => void;
};

/**
 * macOS slider: thin track filled with the accent up to the value, round
 * white knob with a soft shadow.
 */
export function Range({ value, min, max, onValueChange, className, style, ...props }: RangeProps) {
	const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
	return (
		<input
			type="range"
			min={min}
			max={max}
			value={Math.min(max, Math.max(min, value))}
			onChange={e => onValueChange(Number.parseFloat(e.currentTarget.value))}
			style={{ ...style, "--fill": `${pct}%` } as React.CSSProperties}
			className={cn("range-mac", className)}
			{...props}
		/>
	);
}
