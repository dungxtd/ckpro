import { IconButton } from "@cktry/ui/components/icon-button";
import { cn } from "@cktry/ui/lib/utils";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/** How wide a screen grows: `wide` for what spreads out (Home, the
 * Calendar, History), `reading` for a column of rows and text */
const WIDTHS = { wide: "max-w-[1440px]", reading: "max-w-3xl" };

/**
 * A screen's page: its title set large at the top, as macOS apps do (the
 * title bar shows it small once it scrolls away), and its content under it.
 * Every screen starts at the same left edge, so its title stays put from
 * one screen to the next; only how far it grows differs
 */
export function Screen({
	title,
	onBack,
	actions,
	width = "reading",
	className,
	children,
}: {
	title: ReactNode;
	/** A page under another (Settings' own): a chevron back to it */
	onBack?: () => void;
	/** Beside the title, at the end */
	actions?: ReactNode;
	width?: keyof typeof WIDTHS;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("flex flex-col gap-6 px-8 pt-1 pb-10", WIDTHS[width], className)}>
			{/* The actions go under the title when the page is too narrow for both */}
			<header className="flex flex-wrap items-center gap-x-2 gap-y-3">
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
