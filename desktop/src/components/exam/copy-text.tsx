import { Button } from "@ckdry/ui/components/button";
import { CodeBlock } from "@ckdry/ui/components/code-block";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ckdry/ui/components/tooltip";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { copyToDesktop } from "./desktop-view";

/** How long "Copied" shows */
const COPIED_MS = 1200;

/** Copy to the exam desktop's clipboard; `copied` is true for a moment after */
function useCopy(text: string) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), COPIED_MS);
		return () => clearTimeout(timer);
	}, [copied]);
	return {
		copied,
		copy: () => {
			copyToDesktop(text);
			setCopied(true);
		},
	};
}

/**
 * A value from the question (a host, a name, a command) that copies to the
 * desktop's clipboard on click, as on the exam; it cannot be selected.
 * "Copied" shows over it (a tooltip: the panel's edges do not clip it).
 */
export function CopyText({
	text,
	className,
	children,
}: {
	text: string;
	className?: string;
	children?: ReactNode;
}) {
	const { copied, copy } = useCopy(text);
	return (
		<Tooltip open={copied}>
			<TooltipTrigger asChild>
				{/* biome-ignore lint/a11y/useSemanticElements: inline code that wraps with the text, as a button cannot */}
				<code
					// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: same: it takes the button's role and keys
					role="button"
					tabIndex={0}
					aria-label={copied ? `Copied ${text}` : `Copy ${text}`}
					onClick={copy}
					onKeyDown={e => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							copy();
						}
					}}
					// Background tints, not a ring: a ring is drawn outside the value
					// and the panel's edges clip it. Long paths wrap anywhere
					className={cn(
						"cursor-pointer select-none outline-none transition-colors [box-decoration-break:clone] [overflow-wrap:anywhere] hover:bg-highlight/25 focus-visible:outline-2 focus-visible:outline-highlight focus-visible:-outline-offset-2",
						className,
						// Over the Markdown's own code background
						copied && "bg-success/25!"
					)}
				>
					{children ?? text}
				</code>
			</TooltipTrigger>
			<TooltipContent className="flex items-center gap-1">
				<Check className="size-3 text-success" /> Copied
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * A code block (a command, a manifest): its language as the title and Copy
 * at the top right, to the exam desktop's clipboard (Ctrl+Shift+V in its
 * terminal). The same everywhere code is shown: the task, the solution, the
 * assistant's answers.
 */
export function CopyBlock({ text, lang }: { text: string; lang?: string }) {
	const { copied, copy } = useCopy(text);
	return (
		<CodeBlock
			// Small: the panel is narrow and commands are long
			className="text-2xs leading-relaxed"
			title={lang ?? "text"}
			actions={
				<Button
					variant="quiet"
					size="inline"
					className={cn(copied && "text-success hover:text-success")}
					aria-label={copied ? "Copied" : "Copy"}
					onClick={copy}
				>
					{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
				</Button>
			}
		>
			{text}
		</CodeBlock>
	);
}
