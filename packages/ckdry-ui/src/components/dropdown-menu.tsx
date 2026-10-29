import { menu } from "@ckdry/ui/components/menu";
import { useThemeScope } from "@ckdry/ui/components/theme-scope";
import { cn } from "@ckdry/ui/lib/utils";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import type * as React from "react";

/**
 * A menu opened from a button, with submenus (hover or arrow keys open them)
 * and choices: the macOS look every menu shares. Rows that pick one of a set
 * are `DropdownMenuRadioItem`s, checked at the left.
 */
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/** The surface: never larger than the room the window leaves */
const surface = cn(
	menu.surface,
	"z-floating max-h-(--radix-dropdown-menu-content-available-height) min-w-48 overflow-y-auto outline-none fade-in-0 zoom-in-95 data-[state=open]:animate-in"
);

function DropdownMenuContent({
	className,
	sideOffset = 6,
	collisionPadding = 8,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
	const theme = useThemeScope();
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				data-slot="dropdown-menu-content"
				data-theme={theme}
				sideOffset={sideOffset}
				collisionPadding={collisionPadding}
				className={cn(surface, className)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	);
}

function DropdownMenuItem({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
	return <DropdownMenuPrimitive.Item className={cn(menu.row, className)} {...props} />;
}

/** One of a set; `detail`: a short second line under its name */
function DropdownMenuRadioItem({
	className,
	children,
	detail,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & { detail?: React.ReactNode }) {
	return (
		<DropdownMenuPrimitive.RadioItem
			className={cn(menu.row, detail !== undefined && menu.twoLine, className)}
			{...props}
		>
			<DropdownMenuPrimitive.ItemIndicator className={menu.check}>
				<Check className="size-3" strokeWidth={3} />
			</DropdownMenuPrimitive.ItemIndicator>
			{detail !== undefined ? (
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="flex min-w-0 items-center gap-2">{children}</span>
					<span className={menu.detail}>{detail}</span>
				</span>
			) : (
				children
			)}
		</DropdownMenuPrimitive.RadioItem>
	);
}

/** A row that opens a submenu; `value`: what is chosen there, at the right */
function DropdownMenuSubTrigger({
	className,
	children,
	value,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { value?: React.ReactNode }) {
	return (
		<DropdownMenuPrimitive.SubTrigger
			className={cn(menu.row, "pr-1.5 data-[state=open]:bg-highlight/60", className)}
			{...props}
		>
			{children}
			<span className="ml-auto flex items-center gap-1 pl-3 text-caption opacity-60">
				{value}
				<ChevronRight className="size-3.5" />
			</span>
		</DropdownMenuPrimitive.SubTrigger>
	);
}

function DropdownMenuSubContent({
	className,
	collisionPadding = 8,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
	const theme = useThemeScope();
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.SubContent
				data-theme={theme}
				collisionPadding={collisionPadding}
				className={cn(surface, className)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	);
}

/** Grey text at the top of a menu: a header, or a sentence about its choices */
function DropdownMenuLabel({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
	return <DropdownMenuPrimitive.Label className={cn(menu.header, className)} {...props} />;
}

function DropdownMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
	return <DropdownMenuPrimitive.Separator className={cn(menu.separator, className)} {...props} />;
}

export {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
};
