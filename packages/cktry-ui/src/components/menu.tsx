import { cn } from "@cktry/ui/lib/utils";

/**
 * macOS system menu (NSMenu) base, shared by every menu in the app: the
 * dropdown (Select) and the app's popover menus. Class strings, so components
 * that render their own elements (Radix Select parts, popover rows) reuse one
 * look.
 *
 * Metrics measured from macOS System Settings: 12px surface radius, 5px
 * padding, 24px rows, 13px text, checkmark column 25px, 7px row radius,
 * #3478f6 selection.
 */
export const menu = {
	/** Floating menu surface (material + double edge, see `menu-surface`). */
	surface: "menu-surface rounded-menu p-[5px] text-popover-foreground",
	/** Selectable row; put the checkmark in `check` and a trailing value in `hint`. */
	row: "relative flex h-6 w-full min-w-0 cursor-default whitespace-nowrap select-none items-center gap-2 rounded-control pr-3 pl-[25px] text-left text-callout outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-highlight hover:text-highlight-foreground focus-visible:bg-highlight focus-visible:text-highlight-foreground data-[highlighted]:bg-highlight data-[highlighted]:text-highlight-foreground",
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
	separator: "mx-2.5 my-[5px] h-px bg-current opacity-15",
	/** Non-interactive content (sliders, empty states) aligned with row text. */
	content: "pr-3 pl-[25px]",
};

export function menuRow(className?: string) {
	return cn(menu.row, className);
}
