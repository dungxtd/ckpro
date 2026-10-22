import { menu } from "@ckiu/ui/components/menu";
import { useThemeScope } from "@ckiu/ui/components/theme-scope";
import { cn } from "@ckiu/ui/lib/utils";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import type * as React from "react";

/** Right-click menu (macOS NSMenu look, same rows as every other menu). */
const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

function ContextMenuContent({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
	const theme = useThemeScope();
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Content
				data-slot="context-menu-content"
				data-theme={theme}
				className={cn(
					menu.surface,
					"z-floating min-w-48 fade-in-0 zoom-in-95 animate-in duration-100 outline-none",
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

export {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
};
