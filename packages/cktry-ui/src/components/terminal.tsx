import { cn } from "@cktry/ui/lib/utils";
import type * as React from "react";

/**
 * Text as a terminal shows it: monospace on its own ground, in the theme,
 * lines kept as written. Spans inside take the tones (`Terminal.Ok`, …)
 */
export function Terminal({
	size = "md",
	className,
	...props
}: React.ComponentProps<"pre"> & {
	/** sm: a log under a row, its lines wrapped */
	size?: "md" | "sm";
}) {
	return (
		<pre
			className={cn(
				"select-text overflow-auto border border-terminal-edge bg-terminal font-mono text-terminal-foreground leading-relaxed",
				size === "md"
					? "whitespace-pre rounded-xl p-4 text-[12.5px]"
					: "whitespace-pre-wrap break-words rounded-md px-2.5 py-2 text-2xs text-terminal-foreground/80",
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
Terminal.Muted = tone("text-terminal-muted");
Terminal.Ok = tone("text-terminal-ok");
Terminal.Warn = tone("text-terminal-warn");
Terminal.Bad = tone("text-terminal-bad");
Terminal.Note = tone("text-terminal-note");

/**
 * A prompt to type a command at: `$ `, the line, and after the caret the
 * rest of `suggestion` (when the line starts it) and a `# comment`, faded.
 * Tab takes the suggestion, Escape goes back to `initial`, Enter runs it
 */
function Prompt({
	value,
	onChange,
	onSubmit,
	label,
	initial = "",
	suggestion,
	comment,
	autoFocus,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	/** Its accessible name: what to type, for example */
	label: string;
	initial?: string;
	suggestion?: string;
	comment?: string;
	autoFocus?: boolean;
	className?: string;
}) {
	const rest = suggestion?.startsWith(value) ? suggestion.slice(value.length) : "";
	const faded = `${rest}${comment ? `  # ${comment}` : ""}`;
	return (
		<span className={cn("flex", className)}>
			<span className="text-terminal-muted">$ </span>
			<span className="relative min-w-0 flex-1">
				<input
					aria-label={label}
					// biome-ignore lint/a11y/noAutofocus: a prompt waiting for its command, when asked
					autoFocus={autoFocus}
					spellCheck={false}
					autoComplete="off"
					autoCapitalize="off"
					value={value}
					onChange={e => onChange(e.target.value)}
					onKeyDown={e => {
						if (e.key === "Enter") onSubmit(value);
						else if (e.key === "Tab" && rest && suggestion) {
							e.preventDefault();
							onChange(suggestion);
						} else if (e.key === "Escape") onChange(initial);
					}}
					className="w-full bg-transparent p-0 font-mono text-[length:inherit] text-terminal-foreground leading-[inherit] caret-terminal-foreground outline-none"
				/>
				{/* Monospace: the faded rest starts as many characters in as typed */}
				<span
					aria-hidden
					className="pointer-events-none absolute inset-y-0 right-0 overflow-hidden whitespace-pre text-terminal-faint"
					style={{ left: `${value.length}ch` }}
				>
					{faded}
				</span>
			</span>
		</span>
	);
}
Terminal.Prompt = Prompt;
