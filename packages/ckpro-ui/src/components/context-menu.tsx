import { menu } from "@ckpro/ui/components/menu";
import { menuMotion } from "@ckpro/ui/lib/motion";
import { cn } from "@ckpro/ui/lib/utils";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { Check, ChevronRight } from "lucide-react";
import type * as React from "react";

/** Right-click menu (macOS NSMenu look, same rows as every other menu). */
const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

function ContextMenuContent({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Content
				data-slot="context-menu-content"
				className={cn(
					menu.surface,
					"z-floating min-w-48 origin-(--radix-context-menu-content-transform-origin) outline-none",
					menuMotion,
					className
				)}
				{...props}
			/>
		</ContextMenuPrimitive.Portal>
	);
}

function ContextMenuItem({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item>) {
	return <ContextMenuPrimitive.Item className={cn(menu.row, className)} {...props} />;
}

function ContextMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
	return <ContextMenuPrimitive.Separator className={cn(menu.separator, className)} {...props} />;
}

/** A row that is on or off, checked at the left when on */
function ContextMenuCheckboxItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
	return (
		<ContextMenuPrimitive.CheckboxItem className={cn(menu.row, className)} {...props}>
			<ContextMenuPrimitive.ItemIndicator className={menu.check}>
				<Check className="size-3" strokeWidth={3} />
			</ContextMenuPrimitive.ItemIndicator>
			{children}
		</ContextMenuPrimitive.CheckboxItem>
	);
}

/** Grey text heading a part of the menu */
function ContextMenuLabel({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label>) {
	return <ContextMenuPrimitive.Label className={cn(menu.header, className)} {...props} />;
}

/** One of a set, checked at the left when chosen */
function ContextMenuRadioItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
	return (
		<ContextMenuPrimitive.RadioItem className={cn(menu.row, className)} {...props}>
			<ContextMenuPrimitive.ItemIndicator className={menu.check}>
				<Check className="size-3" strokeWidth={3} />
			</ContextMenuPrimitive.ItemIndicator>
			{children}
		</ContextMenuPrimitive.RadioItem>
	);
}

/** A row that opens a submenu; `value`: what is chosen there, at the right */
function ContextMenuSubTrigger({
	className,
	children,
	value,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & { value?: React.ReactNode }) {
	return (
		<ContextMenuPrimitive.SubTrigger
			className={cn(menu.row, "pr-1.5 data-[state=open]:bg-highlight/60", className)}
			{...props}
		>
			{children}
			<span className="ml-auto flex items-center gap-1 pl-3 text-caption opacity-60">
				{value}
				<ChevronRight className="size-3.5" />
			</span>
		</ContextMenuPrimitive.SubTrigger>
	);
}

function ContextMenuSubContent({
	className,
	collisionPadding = 8,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.SubContent
				collisionPadding={collisionPadding}
				className={cn(
					menu.surface,
					"z-floating min-w-44 origin-(--radix-context-menu-content-transform-origin) outline-none",
					menuMotion,
					className
				)}
				{...props}
			/>
		</ContextMenuPrimitive.Portal>
	);
}

export {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
};
