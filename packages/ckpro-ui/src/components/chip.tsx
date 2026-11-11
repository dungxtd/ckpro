import { pressMotion } from "@ckpro/ui/lib/motion";
import { cn } from "@ckpro/ui/lib/utils";
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
	/** default: a quiet tint (dark fill when `selected`). planned: outlined in
	 * the accent, something set for later. exam: the accent's solid fill, the
	 * day or thing that counts. */
	variant?: "default" | "planned" | "exam";
};

/**
 * The one pill chip: selectable (scopes, sort/quality), informational, or
 * removable (active filters). Same surface and selected fill everywhere; it
 * tints on hover and gives a little under a press, it does not grow or glow.
 */
export function Chip({
	selected,
	count,
	onRemove,
	onClick,
	size = "sm",
	variant = "default",
	className,
	children,
	type = "button",
	...props
}: ChipProps) {
	const base = cn(
		"inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
		size === "xs"
			? "h-5.5 gap-1 text-2xs"
			: size === "sm"
				? "h-7 text-callout"
				: "h-8 text-caption",
		onRemove ? (size === "xs" ? "pr-0.5 pl-2" : "pr-1 pl-3") : size === "xs" ? "px-2" : "px-3",
		// Filled tint (not a surface + edge), so a chip reads the same on the page,
		// in sheets and in menus; selected gets the solid segmented-thumb fill.
		variant === "planned"
			? "text-highlight ring-1 ring-highlight ring-inset hover:bg-highlight/10"
			: variant === "exam"
				? "bg-highlight text-highlight-foreground"
				: selected
					? "glass-selected text-glass-selected-foreground"
					: "bg-fill-quiet text-foreground/80 hover:bg-foreground/[0.12] hover:text-foreground",
		// What acts gives a little under a press
		onClick && !onRemove && pressMotion,
		className
	);
	const badge = count !== undefined && (
		<span
			className={cn(
				"min-w-5 rounded-full px-1.5 text-center text-2xs tabular-nums",
				selected || variant === "exam"
					? "bg-glass-selected-foreground/25"
					: "bg-foreground/8 text-muted-foreground"
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
					// Which chip: "Remove" alone does not say
					aria-label={typeof children === "string" ? `Remove ${children}` : "Remove"}
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
