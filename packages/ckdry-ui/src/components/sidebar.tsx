import { cn } from "@ckdry/ui/lib/utils";
import { ChevronRight, Eye, EyeOff, GripHorizontal, Minus } from "lucide-react";
import type * as React from "react";

/**
 * The window's sidebar: an inset panel over the window's own translucent
 * material, as in macOS apps with a source list. Its top row sits beside the
 * window's buttons and drags the window.
 */
export function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
	return (
		<aside
			className={cn(
				"m-2 mr-0 flex w-[248px] shrink-0 select-none flex-col overflow-hidden rounded-xl bg-sidebar-panel shadow-[inset_0_0_0_0.5px_var(--capsule-edge)]",
				className
			)}
			{...props}
		/>
	);
}

/** A group's name in the sidebar */
export function SidebarLabel({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("px-2.5 pt-5 pb-1 font-semibold text-2xs text-muted-foreground", className)}
			{...props}
		/>
	);
}

/**
 * A group's name in the sidebar that folds its items away and back: a
 * chevron that turns, and how many it holds while folded. `trailing`:
 * controls after it (while the sidebar is edited)
 */
export function SidebarGroupToggle({
	label,
	open,
	count,
	onToggle,
	trailing,
	className,
	...props
}: React.ComponentProps<"div"> & {
	label: React.ReactNode;
	open: boolean;
	count?: number;
	onToggle: () => void;
	trailing?: React.ReactNode;
}) {
	return (
		<div className={cn("flex items-center gap-1 rounded-md pt-5 pr-1", className)} {...props}>
			<button
				type="button"
				aria-expanded={open}
				onClick={onToggle}
				className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2.5 pb-1 text-left font-semibold text-2xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
			>
				<span className="flex-1">{label}</span>
				{!open && count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
				<ChevronRight
					className={cn(
						"size-3 transition-transform duration-150 motion-reduce:transition-none",
						open && "rotate-90"
					)}
				/>
			</button>
			{trailing && <span className="flex shrink-0 items-center gap-0.5 pb-1">{trailing}</span>}
		</div>
	);
}

type SidebarItemProps = React.ComponentProps<"button"> & {
	icon?: React.ReactNode;
	label: React.ReactNode;
	/** A second, smaller line */
	detail?: React.ReactNode;
	/** The detail as a warning (a problem with this item) */
	warning?: boolean;
	/** The item shown now */
	current?: boolean;
	/** Controls before and after it (while the sidebar is edited): the row
	 * is then not a button itself, they are */
	leading?: React.ReactNode;
	trailing?: React.ReactNode;
};

/** One destination in the sidebar: an icon, its name, and a line about it */
export function SidebarItem({
	icon,
	label,
	detail,
	warning,
	current,
	leading,
	trailing,
	className,
	type = "button",
	...props
}: SidebarItemProps) {
	const edited = leading !== undefined || trailing !== undefined;
	const rowClass = cn(
		"flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-[14px] text-foreground/85 outline-none transition-colors duration-150 hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-ring aria-[current]:bg-sidebar-selected aria-[current]:font-semibold aria-[current]:text-foreground motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground aria-[current]:[&>svg]:text-foreground",
		className
	);
	const body = (
		<>
			{leading}
			{icon}
			<span className="min-w-0 flex-1">
				<span className="block truncate">{label}</span>
				{detail && (
					<span
						className={cn(
							"block truncate font-normal text-2xs",
							warning ? "text-warning" : "text-muted-foreground"
						)}
					>
						{detail}
					</span>
				)}
			</span>
			{trailing && <span className="flex shrink-0 items-center gap-0.5">{trailing}</span>}
		</>
	);
	if (edited) {
		const { onClick: _click, ...rest } = props;
		return (
			<div
				aria-current={current ? "page" : undefined}
				className={cn(rowClass, "cursor-grab active:cursor-grabbing")}
				{...(rest as React.ComponentProps<"div">)}
			>
				{body}
			</div>
		);
	}
	return (
		<button type={type} aria-current={current ? "page" : undefined} className={rowClass} {...props}>
			{body}
		</button>
	);
}

/** While the sidebar is edited: what a row is dragged by */
export function SidebarGrip() {
	return <GripHorizontal aria-hidden className="size-4 text-muted-foreground/70" />;
}

/** While the sidebar is edited: show or hide a row; `name` says which */
export function SidebarEye({
	hidden,
	name,
	onToggle,
}: {
	hidden: boolean;
	name: string;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={`${hidden ? "Show" : "Hide"} ${name}`}
			aria-pressed={!hidden}
			onClick={onToggle}
			className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
		>
			{hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
		</button>
	);
}

/** While the sidebar is edited: delete a row (a red minus at its start) */
export function SidebarRemove({ name, onRemove }: { name: string; onRemove: () => void }) {
	return (
		<button
			type="button"
			aria-label={`Delete ${name}`}
			onClick={onRemove}
			className="grid size-4 shrink-0 place-items-center rounded-full bg-destructive text-white outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<Minus className="size-3" strokeWidth={3} />
		</button>
	);
}
