"use client";

import { cn, focusRing } from "@ckpro/ui/lib/utils";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import type * as React from "react";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				// macOS switch: grey off, accent blue on, white knob with a shadow.
				"peer inline-flex h-5.5 w-9.5 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-highlight data-[state=unchecked]:bg-[var(--switch-off)]",
				focusRing,
				className
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none block size-4.5 rounded-full bg-white shadow-(--shadow-thumb) transition-transform duration-150 ease-out data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 motion-reduce:transition-none"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
