import { Button } from "@ckdry/ui/components/button";
import { CodeBlock } from "@ckdry/ui/components/code-block";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { noImage, PROSE } from "@/components/markdown";
import { copyToDesktop } from "./desktop-view";
import { DocLink } from "./doc-link";

type Node = {
	type: string;
	value?: string;
	properties?: { className?: string[] };
	children?: Node[];
};
const textOf = (n?: Node): string =>
	n?.type === "text" ? (n.value ?? "") : (n?.children ?? []).map(textOf).join("");

/** A code block: the kit's framed CodeBlock, its
 * language as the title, and Copy (to the exam desktop's clipboard:
 * Ctrl+Shift+V in its terminal) */
function AnswerCode({ node }: { node?: Node }) {
	const code = node?.children?.[0];
	const lang = code?.properties?.className?.[0]?.replace("language-", "") ?? "text";
	const text = textOf(code).replace(/\n$/, "");
	const [copied, setCopied] = useState(false);
	return (
		<CodeBlock
			className="leading-relaxed"
			title={lang}
			actions={
				<Button
					variant="quiet"
					size="inline"
					onClick={() => {
						copyToDesktop(text);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
				>
					{copied ? <Check className="size-3" /> : <Copy className="size-3" />}{" "}
					{copied ? "Copied" : "Copy"}
				</Button>
			}
		>
			{text}
		</CodeBlock>
	);
}

const COMPONENTS: Components = {
	pre: ({ node }) => (
		<div className="my-1.5">
			<AnswerCode node={node as Node} />
		</div>
	),
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
