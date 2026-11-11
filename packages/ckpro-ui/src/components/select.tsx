import { menu } from "@ckpro/ui/components/menu";
import { menuMotion } from "@ckpro/ui/lib/motion";
import { cn } from "@ckpro/ui/lib/utils";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon, ChevronsUpDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
	return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
	return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
	className,
	size = "default",
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: "sm" | "default" }) {
	return (
		<SelectPrimitive.Trigger
			data-slot="select-trigger"
			data-size={size}
			className={cn(
				// macOS pop-up button: the value plus a small round ⌃⌄ button. Opens
				// the menu over itself with the current item lined up.
				"group/popup inline-flex w-fit cursor-pointer items-center justify-end gap-2 whitespace-nowrap rounded-lg py-1 pr-1 pl-2 text-callout outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
				className
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon asChild>
				<span className="grid size-5.5 shrink-0 place-items-center rounded-full bg-[var(--seg-bg)] text-foreground/80 transition-colors group-hover/popup:bg-[var(--seg-on)] group-hover/popup:shadow-(--shadow-thumb)">
					<ChevronsUpDownIcon className="size-3" strokeWidth={2.5} />
				</span>
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

function SelectScrollUpButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
	return (
		<SelectPrimitive.ScrollUpButton
			data-slot="select-scroll-up-button"
			className={cn("flex cursor-default items-center justify-center py-1", className)}
			{...props}
		>
			<ChevronUpIcon className="size-4" />
		</SelectPrimitive.ScrollUpButton>
	);
}

function SelectScrollDownButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
	return (
		<SelectPrimitive.ScrollDownButton
			data-slot="select-scroll-down-button"
			className={cn("flex cursor-default items-center justify-center py-1", className)}
			{...props}
		>
			<ChevronDownIcon className="size-4" />
		</SelectPrimitive.ScrollDownButton>
	);
}

function SelectContent({
	className,
	children,
	// macOS pop-up button: the menu opens over the trigger, selected item aligned.
	position = "item-aligned",
	...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				data-slot="select-content"
				className={cn(
					menu.surface,
					"relative z-floating max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-y-auto overflow-x-hidden p-0",
					menuMotion,
					position === "popper" &&
						"data-[side=left]:-translate-x-1 data-[side=top]:-translate-y-1 data-[side=right]:translate-x-1 data-[side=bottom]:translate-y-1",
					className
				)}
				position={position}
				{...props}
			>
				<SelectScrollUpButton />
				<SelectPrimitive.Viewport
					className={cn(
						"p-1",
						position === "popper" &&
							"h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
					)}
				>
					{children}
				</SelectPrimitive.Viewport>
				<SelectScrollDownButton />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
	return (
		<SelectPrimitive.Label
			data-slot="select-label"
			className={cn(menu.header, className)}
			{...props}
		/>
	);
}

function SelectItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			className={cn(
				menu.row,
				"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className
			)}
			{...props}
		>
			<span className={menu.check}>
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="size-3" strokeWidth={3} />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
	return (
		<SelectPrimitive.Separator
			data-slot="select-separator"
			className={cn("pointer-events-none", menu.separator, className)}
			{...props}
		/>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
};
