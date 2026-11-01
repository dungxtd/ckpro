import { cn } from "@ckpro/ui/lib/utils";
import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
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
				"min-w-0 text-callout [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2 [&_ol]:my-1.5 [&_p]:my-1.5 [&_ul]:my-1.5",
				className
			)}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
				{children}
			</ReactMarkdown>
		</div>
	);
});

/** The candidate's own message: a bubble on the right, as wide as its text */
export function UserMessage({ children, className }: { children: string; className?: string }) {
	return (
		<div
			className={cn(
				"my-1 ml-10 w-fit max-w-full self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-highlight/15 px-3 py-1.5 text-callout [overflow-wrap:anywhere]",
				className
			)}
		>
			{children}
		</div>
	);
}
