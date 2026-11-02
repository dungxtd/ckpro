import { cn } from "@cktry/ui/lib/utils";
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
			<span className="text-white/45">$ </span>
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
					className="pointer-events-none absolute inset-y-0 right-0 overflow-hidden whitespace-pre text-white/30"
					style={{ left: `${value.length}ch` }}
				>
					{faded}
				</span>
			</span>
		</span>
	);
}
Terminal.Prompt = Prompt;
