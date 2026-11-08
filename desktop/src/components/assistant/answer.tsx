import { IconButton } from "@cktry/ui/components/icon-button";
import { cn } from "@cktry/ui/lib/utils";
import { ArrowUpToLine, Copy } from "lucide-react";
import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { DocLink } from "@/components/text/doc-link";
import { MarkdownCode, noImage, PROSE } from "@/components/text/markdown";

const COMPONENTS: Components = {
	pre: ({ node }) => <MarkdownCode node={node as never} />,
	// Documentation opens where the candidate reads it: the desktop's Firefox
	a: ({ href, children }) => <DocLink href={href}>{children}</DocLink>,
	// An answer's images could carry the task out to any server: never loaded
	img: noImage,
};

/** An assistant answer: Markdown, its code copyable to the desktop. Only
 * the answer being written renders again as it grows */
export const Answer = memo(function Answer({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				PROSE,
				"min-w-0 select-text text-callout [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2 [&_ol]:my-1.5 [&_p]:my-1.5 [&_ul]:my-1.5",
				className
			)}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
				{children}
			</ReactMarkdown>
		</div>
	);
});

/** The candidate's own message: a bubble on the right, as wide as its text.
 * An answer's "go to the question" finds it by `data-question` */
export function UserMessage({ children, className }: { children: string; className?: string }) {
	return (
		<div
			data-question
			className={cn(
				"my-1 ml-10 w-fit max-w-full select-text self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-highlight/15 px-3 py-1.5 text-callout [overflow-wrap:anywhere]",
				className
			)}
		>
			{children}
		</div>
	);
}

/** The question an answer replies to: the last candidate message before the
 * answer's element (marked `data-answer`), in the same list */
function questionOf(from: Element): HTMLElement | null {
	let el = from.closest("[data-answer]")?.previousElementSibling ?? null;
	while (el && !(el instanceof HTMLElement && el.dataset.question !== undefined))
		el = el.previousElementSibling;
	return el as HTMLElement | null;
}

/**
 * Under an answer: copy it to this Mac's clipboard, and go back up to the
 * question it answers (long sessions). They show on hovering the answer,
 * whose element is a `group/answer` marked `data-answer`, or on focus;
 * `children` (Regenerate) always show
 */
export function AnswerActions({ text, children }: { text: string; children?: ReactNode }) {
	return (
		<div className="flex items-center gap-1 text-3xs text-muted-foreground">
			{/* Out of the way until the answer is pointed at (or tabbed to) */}
			<span className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/answer:opacity-100">
				<IconButton
					variant="toolbar"
					size="xs"
					aria-label="Copy this answer"
					onClick={() =>
						navigator.clipboard.writeText(text).then(
							() => toast.success("Answer copied", { duration: 1500 }),
							() => toast.error("Could not copy the answer")
						)
					}
				>
					<Copy />
				</IconButton>
				<IconButton
					variant="toolbar"
					size="xs"
					aria-label="Go to the question"
					onClick={e =>
						questionOf(e.currentTarget)?.scrollIntoView({ behavior: "smooth", block: "start" })
					}
				>
					<ArrowUpToLine />
				</IconButton>
			</span>
			{children}
		</div>
	);
}
