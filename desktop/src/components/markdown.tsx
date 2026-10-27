import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { CopyText } from "@/components/exam/copy-text";
import { DocLink } from "@/components/exam/doc-link";
import { ApiError, browserApi } from "@/tauri/api";

type Node = { type: string; value?: string; children?: Node[] };
const textOf = (node?: Node): string =>
	node?.type === "text" ? (node.value ?? "") : (node?.children ?? []).map(textOf).join("");

/** Code and code blocks copy to the exam desktop on click; links open in its Firefox */
const COPY: Components = {
	code: ({ node }) => <CopyText text={textOf(node as Node)} />,
	pre: ({ node }) => <CopyText block text={textOf(node as Node).replace(/\n$/, "")} />,
	a: ({ href, children }) => <DocLink href={href}>{children}</DocLink>,
};

/** Elsewhere a link opens in the system browser: followed in the app's own
 * window it would replace the app */
const BROWSER: Components = {
	a: ({ href, children }) => (
		<a
			href={href}
			className="text-highlight underline-offset-2 hover:underline"
			onClick={e => {
				e.preventDefault();
				if (href)
					browserApi
						.open(href)
						.catch(err => toast.error(err instanceof ApiError ? err.message : String(err)));
			}}
		>
			{children}
		</a>
	),
};

/**
 * Question and solution text: GitHub-flavoured Markdown, styled for reading.
 * `copy`: its code copies to the exam desktop on click, its links open in the
 * desktop's Firefox. Otherwise links open in the system browser.
 */
export function Markdown({ children, copy }: { children: string; copy?: boolean }) {
	return (
		<div className="text-sm leading-relaxed [&_h1]:mt-4 [&_h1]:mb-1 [&_h1]:font-semibold [&_h1]:text-base [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_strong]:font-semibold [&>:first-child]:mt-0 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:[overflow-wrap:anywhere] [&_pre_code]:[overflow-wrap:normal] [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={copy ? COPY : BROWSER}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
