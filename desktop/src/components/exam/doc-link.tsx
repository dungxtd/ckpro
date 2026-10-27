import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";
import { toast } from "sonner";
import { ApiError, desktopApi } from "@/tauri/api";

/** Documentation opens where the candidate reads it, as on the exam: the
 * desktop's Firefox (allowed documentation only) */
export function openOnDesktop(url: string) {
	return desktopApi
		.openUrl(url)
		.then(() =>
			toast.success("Opened in the desktop's Firefox", { id: "open-doc", duration: 1500 })
		)
		.catch(e => toast.error(e instanceof ApiError ? e.message : String(e), { id: "open-doc" }));
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
