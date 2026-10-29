import { cn } from "@ckdry/ui/lib/utils";
import { XIcon } from "lucide-react";
import type * as React from "react";

type ChipProps = Omit<React.ComponentProps<"button">, "onClick"> & {
	/** Selected: dark (light theme) / grey (dark theme) fill. */
	selected?: boolean;
	/** Small count badge after the label. */
	count?: number;
	/** Makes the chip static and adds a × remove button. */
	onRemove?: () => void;
	onClick?: () => void;
	/** xs 22px (context in a composer) · sm 28px (filters, scopes) · md 32px (source sort/quality). */
	size?: "xs" | "sm" | "md";
};

/**
 * The one pill chip: selectable (scopes, sort/quality), informational, or
 * removable (active filters). Same surface, selected fill and hover glow
 * everywhere.
 */
export function Chip({
	selected,
	count,
	onRemove,
	onClick,
	size = "sm",
	className,
	children,
	type = "button",
	...props
}: ChipProps) {
	const base = cn(
		"hover-glow inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
		size === "xs" ? "h-[22px] gap-1 text-2xs" : size === "sm" ? "h-7 text-callout" : "h-8 text-xs",
		onRemove ? (size === "xs" ? "pr-0.5 pl-2" : "pr-1 pl-3") : size === "xs" ? "px-2" : "px-3",
		// Filled tint (not a surface + edge), so a chip reads the same on the page,
		// in sheets and in menus; selected gets the solid segmented-thumb fill.
		selected
			? "glass-selected text-glass-selected-foreground"
			: "bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.12] hover:text-foreground",
		className
	);
	const badge = count !== undefined && (
		<span
			className={cn(
				"min-w-5 rounded-full px-1.5 text-center text-2xs tabular-nums",
				selected ? "bg-white/25" : "bg-foreground/8 text-muted-foreground"
			)}
		>
			{count}
		</span>
	);

	if (onRemove) {
		return (
			<span className={base}>
				{children}
				{badge}
				<button
					type="button"
					aria-label="Remove"
					onClick={onRemove}
					className="grid size-5 cursor-pointer place-items-center rounded-full bg-[var(--seg-bg)] hover:bg-foreground/15"
				>
					<XIcon className="size-3" />
				</button>
			</span>
		);
	}
	if (!onClick) {
		return (
			<span className={base}>
				{children}
				{badge}
			</span>
		);
	}
	return (
		<button
			type={type}
			aria-pressed={selected}
			onClick={onClick}
			className={cn(base, "cursor-pointer")}
			{...props}
		>
			{children}
			{badge}
		</button>
	);
}
