import { cn, focusRing } from "@ckpro/ui/lib/utils";
import { Minus, Plus } from "lucide-react";
import type * as React from "react";

/** macOS-style stepper: − value + in one small track, for exact values. */
export function Stepper({
	value,
	onDecrement,
	onIncrement,
	label,
	decrementDisabled,
	incrementDisabled,
	className,
}: {
	value: React.ReactNode;
	onDecrement: () => void;
	onIncrement: () => void;
	/** Accessible name, e.g. "Playback speed". */
	label: string;
	decrementDisabled?: boolean;
	incrementDisabled?: boolean;
	className?: string;
}) {
	const btn = cn(
		"grid h-6 w-7 cursor-pointer place-items-center rounded-md transition-colors hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-3.5",
		focusRing
	);
	return (
		<fieldset
			aria-label={label}
			className={cn(
				"m-0 inline-flex min-w-0 items-center rounded-lg border-0 bg-[var(--seg-bg)] p-0.5",
				className
			)}
		>
			<button
				type="button"
				aria-label={`Decrease ${label}`}
				className={btn}
				onClick={onDecrement}
				disabled={decrementDisabled}
			>
				<Minus />
			</button>
			<output className="min-w-14 px-1 text-center text-callout tabular-nums">{value}</output>
			<button
				type="button"
				aria-label={`Increase ${label}`}
				className={btn}
				onClick={onIncrement}
				disabled={incrementDisabled}
			>
				<Plus />
			</button>
		</fieldset>
	);
}
