import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";
import { useLayoutEffect, useRef } from "react";

/**
 * Multi-line text, growing with its content (up to `max-h`, then it
 * scrolls; never under its `rows`). bare: no frame of its own, for a
 * composer that draws the frame around it and its buttons. It measures
 * itself as it changes, the same on every web view (CSS field-sizing is
 * Chromium's only)
 */
function Textarea({
	variant = "default",
	className,
	ref,
	onInput,
	...props
}: React.ComponentProps<"textarea"> & { variant?: "default" | "bare" }) {
	const own = useRef<HTMLTextAreaElement | null>(null);
	const fit = () => {
		const element = own.current;
		if (!element) return;
		// From its rows' height up to its content's, its borders on top
		element.style.height = "auto";
		element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
	};
	// A value or rows set from outside change the height too
	// biome-ignore lint/correctness/useExhaustiveDependencies: these props are the cue to fit again
	useLayoutEffect(fit, [props.value, props.rows]);
	return (
		<textarea
			data-slot="textarea"
			ref={element => {
				own.current = element;
				if (typeof ref === "function") return ref(element);
				if (ref) ref.current = element;
			}}
			onInput={e => {
				fit();
				onInput?.(e);
			}}
			className={cn(
				"block w-full min-w-0 resize-none text-sm outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50",
				variant === "default" &&
					"glass-surface min-h-16 rounded-lg px-3 py-2 focus-visible:ring-[3px] focus-visible:ring-ring/50",
				variant === "bare" && "bg-transparent",
				className
			)}
			{...props}
		/>
	);
}

export { Textarea };
