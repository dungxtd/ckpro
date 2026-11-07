import { IconButton } from "@ckpro/ui/components/icon-button";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A screen's page: its title set large at the top, as macOS apps do (the
 * title bar shows it small once it scrolls away), and its content under it
 */
export function Screen({
	title,
	onBack,
	actions,
	className,
	children,
}: {
	title: ReactNode;
	/** A page under another (Settings' own): a chevron back to it */
	onBack?: () => void;
	/** Beside the title, at the end */
	actions?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("mx-auto flex max-w-4xl flex-col gap-6 px-8 pt-1 pb-10", className)}>
			{/* The actions go under the title when the page is too narrow for both */}
			<header className="flex select-none flex-wrap items-center gap-x-2 gap-y-3">
				{onBack && (
					<IconButton
						variant="toolbar"
						size="sm"
						aria-label="Back"
						className="-ml-2"
						onClick={onBack}
					>
						<ChevronLeft />
					</IconButton>
				)}
				<h1 className="flex-1 font-bold text-title leading-tight">{title}</h1>
				{actions}
			</header>
			{children}
		</div>
	);
}
