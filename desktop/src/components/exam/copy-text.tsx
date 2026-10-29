import { Button } from "@ckdry/ui/components/button";
import { CodeBlock } from "@ckdry/ui/components/code-block";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { copyToDesktop } from "./desktop-view";

/** How long a code block's "Copied" shows, and a value's flash */
const COPIED_MS = 1200;
const FLASH_MS = 300;

/** Copy to the exam desktop's clipboard; `copied` is true for `ms` after */
function useCopy(text: string, ms = COPIED_MS) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), ms);
		return () => clearTimeout(timer);
	}, [copied, ms]);
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
 * desktop's clipboard on click, as on the exam; it cannot be selected. Its
 * background flashes green, then fades back.
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
	const { copied, copy } = useCopy(text, FLASH_MS);
	return (
		// biome-ignore lint/a11y/useSemanticElements: inline code that wraps with the text, as a button cannot
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
				"cursor-pointer select-none outline-none transition-colors duration-300 [box-decoration-break:clone] [overflow-wrap:anywhere] hover:bg-highlight/25 focus-visible:outline-2 focus-visible:outline-highlight focus-visible:-outline-offset-2",
				className,
				// Over the Markdown's own code background
				copied && "bg-success/35! duration-0"
			)}
		>
			{children ?? text}
		</code>
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
