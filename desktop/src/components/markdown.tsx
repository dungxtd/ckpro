import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { CopyText } from "@/components/exam/copy-text";
import { ApiError, desktopApi } from "@/tauri/api";

type Node = { type: string; value?: string; children?: Node[] };
const textOf = (node?: Node): string =>
	node?.type === "text" ? (node.value ?? "") : (node?.children ?? []).map(textOf).join("");

/** Documentation opens where the candidate reads it: the desktop's Firefox */
const openOnDesktop = (url: string) =>
	desktopApi
		.openUrl(url)
		.then(() =>
			toast.success("Opened in the desktop's Firefox", { id: "open-doc", duration: 1500 })
		)
		.catch(e => toast.error(e instanceof ApiError ? e.message : String(e), { id: "open-doc" }));

/** Code and code blocks copy to the exam desktop on click; links open in its Firefox */
const COPY: Components = {
	code: ({ node }) => <CopyText text={textOf(node as Node)} />,
	pre: ({ node }) => <CopyText block text={textOf(node as Node).replace(/\n$/, "")} />,
	a: ({ href, children }) => (
		<a
			href={href}
			className="text-highlight underline-offset-2 hover:underline"
			onClick={e => {
				e.preventDefault();
				if (href) openOnDesktop(href);
			}}
		>
			{children}
		</a>
	),
};

/**
 * Question and solution text: GitHub-flavoured Markdown, styled for reading.
 * `copy`: its code copies to the exam desktop on click, its links open in the
 * desktop's Firefox.
 */
export function Markdown({ children, copy }: { children: string; copy?: boolean }) {
	return (
		<div className="text-sm leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={copy ? COPY : undefined}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
