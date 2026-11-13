import { cn } from "@ckpro/ui/lib/utils";
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
	// One Tab stop, the selected segment; the arrows move the selection, as
	// in a radio group, and Home and End go to the first and last
	const keys = (e: React.KeyboardEvent<HTMLDivElement>) => {
		const at = options.findIndex(o => o.value === value);
		const last = options.length - 1;
		const to = {
			ArrowLeft: at - 1,
			ArrowUp: at - 1,
			ArrowRight: at + 1,
			ArrowDown: at + 1,
			Home: 0,
			End: last,
		}[e.key];
		if (to === undefined || !options.length) return;
		e.preventDefault();
		// Round from one end to the other
		const next = (to + options.length) % options.length;
		onChange(options[next].value);
		e.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
	};

	return (
		<div
			role="radiogroup"
			aria-label={label}
			onKeyDown={keys}
			className={cn("inline-flex shrink-0 rounded-lg bg-[var(--seg-bg)] p-0.5", className)}
		>
			{options.map((option, i) => {
				const selected = option.value === value;
				// No segment selected: the first takes the Tab stop
				const stop = selected || (i === 0 && !options.some(o => o.value === value));
				return (
					// biome-ignore lint/a11y/useSemanticElements: a segment looks and clicks like a button; it reads as one of a radio group
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						tabIndex={stop ? 0 : -1}
						onClick={() => onChange(option.value)}
						className={cn(
							"h-6 cursor-pointer whitespace-nowrap rounded-md px-3 text-callout outline-none transition-[background-color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
							selected
								? "bg-[var(--seg-on)] font-medium text-foreground shadow-(--shadow-thumb)"
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
