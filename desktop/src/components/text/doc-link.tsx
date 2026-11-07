import { Tooltip, TooltipContent, TooltipTrigger } from "@ckpro/ui/components/tooltip";
import { cn } from "@ckpro/ui/lib/utils";
import { BookOpen } from "lucide-react";
import type * as React from "react";
import { toast } from "sonner";
import { desktopApi, errorText } from "@/tauri/api";

/** Documentation opens where the candidate reads it, as on the exam: the
 * desktop's Firefox (allowed documentation only) */
function openOnDesktop(url: string) {
	return desktopApi
		.openUrl(url)
		.then(() =>
			toast.success("Opened in the desktop's Firefox", { id: "open-doc", duration: 1500 })
		)
		.catch(e => toast.error(errorText(e), { id: "open-doc" }));
}

/** A link on the exam desk: it opens in the desktop's Firefox */
export function DocLink({ href, className, children }: React.ComponentProps<"a">) {
	return (
		<a
			href={href}
			className={cn("text-highlight underline-offset-2 hover:underline", className)}
			onClick={e => {
				e.preventDefault();
				if (href) openOnDesktop(href);
			}}
		>
			{children}
		</a>
	);
}

/**
 * A documentation page's name from its URL, for lists of links where the URLs
 * all start alike: its last path segment and, if any, its section
 * (`…/persistent-volumes/#persistentvolumeclaims` → "Persistent volumes ›
 * Persistentvolumeclaims"). The site shows when it is not kubernetes.io
 */
function docTitle(url: string): { title: string; site: string | null } {
	try {
		const u = new URL(url);
		const words = (s: string) => {
			const t = decodeURIComponent(s)
				.replace(/\.html?$/, "")
				.replace(/[-_]+/g, " ")
				.trim();
			return t.charAt(0).toUpperCase() + t.slice(1);
		};
		const page = u.pathname.split("/").filter(Boolean).at(-1);
		const parts = [
			page ? words(page) : u.hostname,
			u.hash.length > 1 ? words(u.hash.slice(1)) : null,
		];
		const site = u.hostname.replace(/^www\./, "");
		return {
			title: parts.filter(Boolean).join(" › "),
			site: site === "kubernetes.io" ? null : site,
		};
	} catch {
		return { title: url, site: null };
	}
}

/** The task's Quick Reference: page names that open on the desktop, the full
 * URL on hover */
export function DocList({ urls }: { urls: string[] }) {
	return (
		<ul className="flex flex-col gap-1">
			{urls.map(url => {
				const { title, site } = docTitle(url);
				return (
					<li key={url} className="flex min-w-0 items-start gap-1.5">
						<BookOpen className="mt-[3px] size-3.5 shrink-0 text-muted-foreground" />
						<Tooltip>
							<TooltipTrigger asChild>
								<DocLink href={url} className="min-w-0 [overflow-wrap:anywhere]">
									{title}
									{site && <span className="text-muted-foreground"> · {site}</span>}
								</DocLink>
							</TooltipTrigger>
							<TooltipContent className="max-w-sm break-all">{url}</TooltipContent>
						</Tooltip>
					</li>
				);
			})}
		</ul>
	);
}
