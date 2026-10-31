import { cn } from "@ckdry/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * A screen's page: its title set large at the top, as macOS apps do (the
 * title bar shows it small once it scrolls away), and its content under it
 */
export function Screen({
	title,
	actions,
	className,
	children,
}: {
	title: ReactNode;
	/** Beside the title, at the end */
	actions?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("mx-auto flex max-w-4xl flex-col gap-6 px-8 pt-1 pb-10", className)}>
			<header className="flex items-center justify-between gap-4">
				<h1 className="font-bold text-[28px] leading-tight">{title}</h1>
				{actions}
			</header>
			{children}
		</div>
	);
}
