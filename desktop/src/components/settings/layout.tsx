import { cn } from "@cktry/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type * as React from "react";
import type { ReactNode } from "react";

/** A titled group of rows on one rounded card, as macOS settings group them:
 * its name above, a line about it under the card */
export function Group({
	title,
	description,
	children,
}: {
	title: ReactNode;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-1.5">
			<h2 className="select-none px-1 font-semibold text-caption text-muted-foreground">{title}</h2>
			<div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
			{description && <p className="px-1 text-caption text-muted-foreground">{description}</p>}
		</section>
	);
}

/**
 * One setting: its icon and name (and a line about it) left, its control
 * right. With `onClick` the row opens something (a page, a dialog): it is a
 * button, `value` shown before its chevron. The hairline between rows starts
 * at the name, past the icon
 */
export function Row({
	icon,
	label,
	detail,
	value,
	onClick,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"div">, "onClick"> & {
	icon?: ReactNode;
	label: string;
	detail?: string;
	value?: ReactNode;
	onClick?: () => void;
}) {
	const body = (
		<div className="flex min-h-12 min-w-0 flex-1 items-center gap-4 border-border border-t py-2 pr-4 group-first/row:border-t-0">
			<div className="min-w-0 flex-1">
				<div className="text-lead leading-snug">{label}</div>
				{detail && <div className="text-caption text-muted-foreground">{detail}</div>}
			</div>
			{value !== undefined && (
				<span className="shrink-0 text-callout text-muted-foreground">{value}</span>
			)}
			{children && <div className="shrink-0">{children}</div>}
			{onClick && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
		</div>
	);
	const row = cn(
		"group/row flex w-full items-center gap-3 pl-4 text-left [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
		className
	);
	return onClick ? (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				row,
				"outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]"
			)}
		>
			{icon}
			{body}
		</button>
	) : (
		<div className={row} {...props}>
			{icon}
			{body}
		</div>
	);
}
