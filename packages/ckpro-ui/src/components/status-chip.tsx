import { Chip } from "@ckpro/ui/components/chip";
import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

const TONES = {
	default: "",
	highlight: "bg-highlight/10 text-highlight hover:bg-highlight/15 hover:text-highlight",
	warning: "bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning",
	destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
} as const;

/**
 * A status in a bar's corner (what runs in the background, an update): an
 * icon in a chip that slides out to its words under the pointer or focus,
 * over what is beside it, so the bar's layout never moves. `words` are its
 * accessible name too; `tone` tints it (a failure, something required);
 * `expanded` slides its words out without the pointer (news it announces
 * once, as a toast would, before folding back); `onDismiss` adds a × beside
 * the words, there while they are out
 */
export function StatusChip({
	icon,
	words,
	tone = "default",
	count,
	expanded = false,
	onClick,
	onDismiss,
	dismissLabel = "Dismiss",
	className,
}: {
	icon: React.ReactNode;
	words: string;
	tone?: keyof typeof TONES;
	/** How many, when more than one */
	count?: number;
	/** Its words out, whatever the pointer does */
	expanded?: boolean;
	onClick?: () => void;
	/** Puts it away: a × beside the words while they are out */
	onDismiss?: () => void;
	dismissLabel?: string;
	/** Places the chip (`ml-auto` at a bar's end) */
	className?: string;
}) {
	return (
		<span className={cn("group/chip relative flex h-7 items-center", className)}>
			{/* Holds the icon's room; the chip that acts lies over it */}
			<Chip aria-hidden tabIndex={-1} className={cn("invisible", TONES[tone])} count={count}>
				{icon}
			</Chip>
			<Chip
				onClick={onClick}
				onRemove={onDismiss}
				removeLabel={dismissLabel}
				// With a ×, the label is a button of its own, named by its words
				aria-label={onDismiss ? undefined : words}
				className={cn(
					"absolute top-0 right-0 z-10 shadow-(--shadow-control) transition-[background-color,color] motion-safe:transition-[max-width] motion-safe:duration-200",
					TONES[tone],
					// The × only while the words are out
					onDismiss &&
						!expanded &&
						"pr-3 group-focus-within/chip:pr-1 group-hover/chip:pr-1 [&_[data-slot=chip-remove]]:hidden group-focus-within/chip:[&_[data-slot=chip-remove]]:grid group-hover/chip:[&_[data-slot=chip-remove]]:grid"
				)}
				count={count}
			>
				{icon}
				<span
					className={cn(
						"max-w-0 truncate opacity-0 transition-[max-width,opacity] duration-200 ease-out group-focus-within/chip:max-w-72 group-focus-within/chip:opacity-100 group-hover/chip:max-w-72 group-hover/chip:opacity-100 motion-reduce:transition-none",
						expanded && "max-w-72 opacity-100"
					)}
				>
					{words}
				</span>
			</Chip>
		</span>
	);
}
