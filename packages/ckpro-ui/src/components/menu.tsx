import { cn } from "@ckpro/ui/lib/utils";
import { Check } from "lucide-react";
import type * as React from "react";

/**
 * macOS system menu (NSMenu) base, shared by every menu in the app: the
 * dropdown (Select) and the app's popover menus. Class strings, so components
 * that render their own elements (Radix Select parts, popover rows) reuse one
 * look.
 *
 * Metrics after macOS System Settings, on the kit's 4px grid and radius
 * scale: 12px surface radius, 4px padding, 24px rows, 13px text, checkmark
 * column 24px, 8px row radius (the surface's less its padding), the accent
 * (`highlight`) for the selection.
 */
export const menu = {
	/** Floating menu surface (material + double edge, see `menu-surface`). */
	surface: "menu-surface rounded-xl p-1 text-popover-foreground",
	/** Selectable row; put the checkmark in `check` and a trailing value in `hint`. */
	row: "relative flex h-6 w-full min-w-0 cursor-default whitespace-nowrap select-none items-center gap-2 rounded-lg pr-3 pl-6 text-left text-callout outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 disabled:pointer-events-none disabled:opacity-50 hover:bg-highlight hover:text-highlight-foreground focus-visible:bg-highlight focus-visible:text-highlight-foreground data-[highlighted]:bg-highlight data-[highlighted]:text-highlight-foreground",
	/** Checkmark slot at the left of a row. */
	check: "absolute top-1.5 left-2 flex size-3 items-center justify-center",
	/** Trailing secondary text (shortcut, value, source). */
	hint: "ml-auto shrink-0 truncate pl-3 text-caption opacity-60 [:hover>&]:opacity-100",
	/** The row's own text, cut short when the menu is narrow (the hint stays). */
	label: "min-w-0 truncate",
	/** A second line under the row's text (a description), wrapped rather
	 * than cut; the row takes `menuRow(menu.twoLine)` and wraps both lines in
	 * one element. */
	detail: "line-clamp-2 block whitespace-normal text-caption opacity-60 [:hover>*>&]:opacity-100",
	/** Row height for a row with `detail`: the checkmark stays on the first line. */
	twoLine: "h-auto py-0.5",
	/** Grey section header. */
	header: "px-2.5 pt-1.5 pb-0.5 font-semibold text-2xs opacity-55",
	/** Hairline divider between groups. */
	separator: "mx-2.5 my-1 h-px bg-current opacity-15",
	/** Non-interactive content (sliders, empty states) aligned with row text. */
	content: "pr-3 pl-6",
};

export function menuRow(className?: string) {
	return cn(menu.row, className);
}

/** The checkmark of a picked row in a popover menu, as Select draws it */
export function MenuCheck() {
	return (
		<span className={menu.check}>
			<Check className="size-3" strokeWidth={3} />
		</span>
	);
}

/**
 * A row of a popover menu, as a button: its text, an `icon` before it, a
 * `hint` at the end (a shortcut, a value), a `detail` line under it, and a
 * checkmark at the left when `checked`. `checked` says it is on (or the one
 * chosen) to assistive technology too; leave it out on rows that are not
 * choices. Disabled rows fade and take no pointer.
 */
export function MenuItem({
	icon,
	hint,
	detail,
	checked,
	className,
	children,
	type = "button",
	...props
}: React.ComponentProps<"button"> & {
	icon?: React.ReactNode;
	hint?: React.ReactNode;
	detail?: React.ReactNode;
	checked?: boolean;
}) {
	return (
		<button
			type={type}
			aria-pressed={checked}
			className={menuRow(cn(detail !== undefined && menu.twoLine, className))}
			{...props}
		>
			{checked && <MenuCheck />}
			{icon && (
				<span aria-hidden className="flex shrink-0 items-center [&_svg]:size-4">
					{icon}
				</span>
			)}
			{detail !== undefined ? (
				<span className="flex min-w-0 flex-1 flex-col">
					<span className={menu.label}>{children}</span>
					<span className={menu.detail}>{detail}</span>
				</span>
			) : (
				<span className={menu.label}>{children}</span>
			)}
			{hint !== undefined && <span className={menu.hint}>{hint}</span>}
		</button>
	);
}
