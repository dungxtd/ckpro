import { cn } from "@ckdry/ui/lib/utils";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { copyToDesktop } from "./desktop-view";

/**
 * A value from the question (a host, a name, a command) that copies to the
 * desktop's clipboard on click, as on the exam; it cannot be selected.
 * `block` is a code block.
 */
export function CopyText({
	text,
	block,
	className,
	children,
}: {
	text: string;
	block?: boolean;
	className?: string;
	children?: ReactNode;
}) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 1200);
		return () => clearTimeout(timer);
	}, [copied]);
	const copy = () => {
		copyToDesktop(text);
		setCopied(true);
		// A toast: a badge by the value would be clipped at the panel's edges
		toast.success(`Copied ${text.length > 40 ? `${text.slice(0, 40)}…` : text}`, {
			id: "copy",
			duration: 1500,
		});
	};
	const Tag = block ? "pre" : "code";
	return (
		<Tag
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
			className={cn(
				"cursor-pointer select-none outline-none ring-sky-500/60 transition-shadow hover:ring-1 focus-visible:ring-2",
				copied && "ring-1 ring-emerald-500",
				block && "whitespace-pre font-mono text-[0.85em]",
				className
			)}
		>
			{children ?? text}
		</Tag>
	);
}
