import { cn } from "@ckdry/ui/lib/utils";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { CopyBlock, CopyText } from "@/components/text/copy-text";
import { DocLink } from "@/components/text/doc-link";
import { browserApi, errorText } from "@/tauri/api";

type Node = {
	type: string;
	value?: string;
	properties?: { className?: string[] };
	children?: Node[];
};
const textOf = (node?: Node): string =>
	node?.type === "text" ? (node.value ?? "") : (node?.children ?? []).map(textOf).join("");

/** Images are never fetched: a remote image is a request the text makes on
 * its own (it can carry what the page shows). Their alt text stands in */
export const noImage: Components["img"] = ({ alt }) => (alt ? <span>{alt}</span> : null);

/** A fenced block: its language (```yaml) as the title */
export function MarkdownCode({ node }: { node?: Node }) {
	const code = node?.children?.[0];
	const lang = code?.properties?.className?.[0]?.replace("language-", "");
	return (
		<div className="my-2">
			<CopyBlock text={textOf(code).replace(/\n$/, "")} lang={lang} />
		</div>
	);
}

/** Code and code blocks copy to the exam desktop on click; links open in its Firefox */
const COPY: Components = {
	img: noImage,
	code: ({ node }) => <CopyText text={textOf(node as Node)} />,
	pre: ({ node }) => <MarkdownCode node={node as Node} />,
	a: ({ href, children }) => <DocLink href={href}>{children}</DocLink>,
};

/** Elsewhere a link opens in the system browser: followed in the app's own
 * window it would replace the app */
const BROWSER: Components = {
	img: noImage,
	a: ({ href, children }) => (
		<a
			href={href}
			className="text-highlight underline-offset-2 hover:underline"
			onClick={e => {
				e.preventDefault();
				if (href) browserApi.open(href).catch(err => toast.error(errorText(err)));
			}}
		>
			{children}
		</a>
	),
};

/** What every Markdown text shares: headings, lists, inline code, tables */
export const PROSE =
	"leading-relaxed [&>:first-child]:mt-0 [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:[overflow-wrap:anywhere] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:[overflow-wrap:normal] [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2";

/** A page's text: roomier, its code blocks framed here */
const MARKDOWN =
	"text-sm [&_h1]:mt-4 [&_h1]:mb-1 [&_h1]:text-base [&_h2]:mt-4 [&_h2]:mb-1 [&_h3]:mt-3 [&_code]:py-0.5 [&_ol]:my-2 [&_p]:my-2 [&>pre]:my-2 [&>pre]:overflow-auto [&>pre]:rounded-md [&>pre]:bg-muted [&>pre]:p-2 [&_ul]:my-2";

/**
 * Question and solution text: GitHub-flavoured Markdown, styled for reading.
 * `copy`: its code copies to the exam desktop on click, its links open in the
 * desktop's Firefox. Otherwise links open in the system browser. Its size
 * is `className`'s when given (the question's text size).
 */
export function Markdown({
	children,
	copy,
	className,
}: {
	children: string;
	copy?: boolean;
	className?: string;
}) {
	return (
		<div className={cn(PROSE, MARKDOWN, className)}>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={copy ? COPY : BROWSER}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
