import { Tooltip, TooltipContent, TooltipTrigger } from "@ckpro/ui/components/tooltip";
import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

/** One stretch of the bar: what it is, how much, its colour (`className`,
 * a `bg-*` token) */
export interface UsageSegment {
	key: string;
	label: string;
	value: number;
	className: string;
}

/**
 * How a whole is used, as macOS Storage draws it: a stretch per part in its
 * colour, sized by its share, then the room left with its size written in
 * it (`free`). `mark` hatches a need laid in the room left (an estimate to
 * compare: amber when it does not fit). A stretch shows its name and size
 * on hover and picks it (`onSelect`); while one is `selected` the others
 * step back. Sizes ease to new values. The bar is one picture to assistive
 * technology (`label`): what it sums up is listed beside it, the way in by
 * key. `format` writes a value (`memory`)
 */
export function UsageBar({
	label,
	total,
	segments,
	format,
	selected,
	onSelect,
	mark,
	className,
}: {
	label: string;
	total: number;
	segments: UsageSegment[];
	format: (value: number) => string;
	selected?: string | null;
	onSelect?: (key: string) => void;
	mark?: { value: number; tight: boolean } | null;
	className?: string;
}) {
	const used = segments.reduce((n, s) => n + s.value, 0);
	const free = Math.max(0, total - used);
	const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);
	// Sizes ease (flex-grow), not under reduced motion
	const eased =
		"transition-[flex-grow,opacity] duration-300 ease-out motion-reduce:transition-none";
	return (
		<div
			role="img"
			aria-label={label}
			className={cn(
				"group/bar relative flex h-5 gap-0.5 overflow-hidden rounded-md bg-foreground/10",
				className
			)}
		>
			{segments.map(s => (
				<Tooltip key={s.key}>
					<TooltipTrigger asChild>
						{/* For the pointer only: the list it sums up is the way in by key */}
						<button
							type="button"
							tabIndex={-1}
							aria-hidden
							onClick={() => onSelect?.(s.key)}
							style={{ flexGrow: s.value, flexBasis: 0 } as React.CSSProperties}
							className={cn(
								"min-w-1 shrink-0 group-hover/bar:opacity-60 hover:opacity-100!",
								eased,
								onSelect && "cursor-pointer",
								s.className,
								// One picked: the others step back (a thin stretch has no room for a ring)
								selected && selected !== s.key && "opacity-35"
							)}
						/>
					</TooltipTrigger>
					<TooltipContent>
						<div className="font-medium">{s.label}</div>
						<div className="text-muted-foreground">{format(s.value)}</div>
					</TooltipContent>
				</Tooltip>
			))}
			<span
				style={{ flexGrow: free, flexBasis: 0 }}
				className={cn(
					"z-10 grid min-w-0 shrink-0 place-items-center truncate font-semibold text-2xs tabular-nums",
					eased
				)}
			>
				{free > 0 && format(free)}
			</span>
			{mark && free > 0 && (
				<span
					aria-hidden
					data-tight={mark.tight || undefined}
					className="usage-mark pointer-events-none absolute inset-y-0 transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
					style={{
						left: `calc(${share(used)}% + ${segments.length * 2}px)`,
						width: `${share(Math.min(free, mark.value))}%`,
					}}
				/>
			)}
		</div>
	);
}

/** The hatch of a `mark`, for a legend beside the bar */
export function UsageMarkKey({ tight, className }: { tight?: boolean; className?: string }) {
	return (
		<span
			aria-hidden
			data-tight={tight || undefined}
			className={cn("usage-mark block size-2 shrink-0 rounded-xs", className)}
		/>
	);
}
