import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";

export interface SegmentedOption<T extends string> {
	value: T;
	label: React.ReactNode;
}

/**
 * macOS segmented control: a small track with the selected segment raised as
 * a thumb. For 2–5 mutually exclusive options (use Select for longer lists).
 */
export function SegmentedControl<T extends string>({
	options,
	value,
	onChange,
	label,
	className,
}: {
	options: SegmentedOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** Accessible name of the group. */
	label: string;
	className?: string;
}) {
	return (
		<div
			role="radiogroup"
			aria-label={label}
			className={cn("inline-flex shrink-0 rounded-segment bg-[var(--seg-bg)] p-0.5", className)}
		>
			{options.map(option => {
				const selected = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						onClick={() => onChange(option.value)}
						className={cn(
							"h-6 cursor-pointer whitespace-nowrap rounded-tight px-3 text-callout outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
							selected
								? "bg-[var(--seg-on)] font-medium text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.25),inset_0_0.5px_0_rgb(255_255_255/0.2),0_0_0_0.5px_rgb(0_0_0/0.08)]"
								: "text-foreground/75 hover:text-foreground"
						)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
