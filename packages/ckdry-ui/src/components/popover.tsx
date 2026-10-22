import { useThemeScope } from "@ckdry/ui/components/theme-scope";
import { cn } from "@ckdry/ui/lib/utils";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type * as React from "react";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

/** Floating panel on the same macOS menu material as menus and dropdowns. */
function PopoverContent({
	className,
	align = "start",
	sideOffset = 8,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
	const theme = useThemeScope();
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				data-slot="popover-content"
				data-theme={theme}
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"menu-surface z-floating w-80 origin-(--radix-popover-content-transform-origin) rounded-[16px] p-3.5 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
					className
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
