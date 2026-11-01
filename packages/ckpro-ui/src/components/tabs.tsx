import { cn } from "@ckpro/ui/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";

/**
 * Sections of one page, as macOS System Settings lays them out: a sidebar of
 * rows (an icon and a name; the selected one tinted) beside the selected
 * section. Arrow keys move between rows (Radix).
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			orientation="vertical"
			className={cn("flex min-h-0 flex-1", className)}
			{...props}
		/>
	);
}

/** The sidebar */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				"flex w-52 shrink-0 select-none flex-col gap-0.5 border-border border-r p-3",
				className
			)}
			{...props}
		/>
	);
}

/** A row of the sidebar: its icon (an svg child) and name */
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"flex h-8 items-center gap-2 rounded-control px-2.5 text-left text-callout text-foreground/85 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-highlight data-[state=active]:text-highlight-foreground [&_svg]:size-4 [&_svg]:shrink-0",
				className
			)}
			{...props}
		/>
	);
}

/** A section: it scrolls on its own */
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("min-w-0 flex-1 overflow-auto outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
