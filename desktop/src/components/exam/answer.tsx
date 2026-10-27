import { CodeBlock } from "@ckdry/ui/components/code-block";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
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

/** A code block as in Zed and TablePro: the kit's framed CodeBlock, its
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
				<button
					type="button"
					className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
					onClick={() => {
						copyToDesktop(text);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
				>
					{copied ? <Check className="size-3" /> : <Copy className="size-3" />}{" "}
					{copied ? "Copied" : "Copy"}
				</button>
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
};

/** An assistant answer: Markdown, its code copyable to the desktop */
export function Answer({ children, className }: { children: string; className?: string }) {
	return (
		<div
			className={cn(
				"min-w-0 text-[13px] leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:[overflow-wrap:anywhere] [&_pre_code]:[overflow-wrap:normal] [&_h1]:mt-3 [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0",
				className
			)}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
