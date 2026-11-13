import { cn, focusRing } from "@ckpro/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type * as React from "react";

/**
 * A compact row that opens something under it (a step's log, a tool call):
 * its hover and focus, for rows laid out by their own screen
 */
export const disclosureRow = cn(
	"flex items-center gap-2 rounded-md px-1.5 text-left hover:bg-hover",
	focusRing
);

/** The chevron of a row that opens: pointing right, turned down when open */
export function DisclosureChevron({ open, className }: { open: boolean; className?: string }) {
	return (
		<ChevronRight
			aria-hidden
			className={cn(
				"size-3.5 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none",
				open && "rotate-90",
				className
			)}
		/>
	);
}

/**
 * A row that shows or hides what is under it, laid out by its screen: what
 * it is about (`children`), then the chevron, at the end by default or at
 * the `start`. `chevronClassName` sizes or hides it (a row with nothing to
 * open keeps its place: `invisible`)
 */
export function DisclosureButton({
	open,
	chevron = "end",
	chevronClassName,
	className,
	children,
	type = "button",
	...props
}: React.ComponentProps<"button"> & {
	open: boolean;
	chevron?: "start" | "end";
	chevronClassName?: string;
}) {
	const mark = <DisclosureChevron open={open} className={chevronClassName} />;
	return (
		<button
			type={type}
			aria-expanded={open}
			className={cn(disclosureRow, "cursor-pointer", className)}
			{...props}
		>
			{chevron === "start" && mark}
			{children}
			{chevron === "end" && mark}
		</button>
	);
}

/** A row that shows or hides what is under it (a log, details). */
export function Disclosure({
	summary,
	open,
	onOpenChange,
	id,
	className,
	children,
}: {
	summary: React.ReactNode;
	/** To scroll to it, or link to it */
	id?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div id={id} data-slot="disclosure" className={className}>
			<DisclosureButton
				open={open}
				chevron="start"
				onClick={() => onOpenChange(!open)}
				className="w-full rounded-none px-3 py-2 text-sm transition-colors focus-visible:bg-hover focus-visible:ring-0"
			>
				{summary}
			</DisclosureButton>
			{open && <div className="px-3 py-3">{children}</div>}
		</div>
	);
}
