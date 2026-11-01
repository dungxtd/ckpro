import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";

/**
 * Text as a terminal shows it: monospace on a dark ground in both themes,
 * lines kept as written. Spans inside take the tones (`Terminal.Ok`, …)
 */
export function Terminal({ className, ...props }: React.ComponentProps<"pre">) {
	return (
		<pre
			className={cn(
				"overflow-x-auto whitespace-pre rounded-xl border border-white/5 bg-terminal p-4 font-mono text-[12.5px] text-terminal-foreground leading-relaxed",
				className
			)}
			{...props}
		/>
	);
}

const tone =
	(className: string) =>
	({ children }: { children: React.ReactNode }) => <span className={className}>{children}</span>;

/** A command's prompt and other quiet text */
Terminal.Muted = tone("text-white/45");
Terminal.Ok = tone("text-success");
Terminal.Warn = tone("text-warning");
Terminal.Bad = tone("text-destructive");
Terminal.Note = tone("text-highlight");
