import { cn } from "@ckdry/ui/lib/utils";
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
			className={cn("px-2.5 pt-4 pb-1 font-medium text-2xs text-muted-foreground", className)}
			{...props}
		/>
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
};

/** One destination in the sidebar: an icon, its name, and a line about it */
export function SidebarItem({
	icon,
	label,
	detail,
	warning,
	current,
	className,
	type = "button",
	...props
}: SidebarItemProps) {
	return (
		<button
			type={type}
			aria-current={current ? "page" : undefined}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-callout outline-none hover:bg-sidebar-selected focus-visible:ring-2 focus-visible:ring-ring aria-[current]:bg-sidebar-selected aria-[current]:font-semibold [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
				className
			)}
			{...props}
		>
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
		</button>
	);
}
