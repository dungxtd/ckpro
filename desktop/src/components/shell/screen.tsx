import { IconButton } from "@ckpro/ui/components/icon-button";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronLeft } from "lucide-react";
import type * as React from "react";
import type { ReactNode } from "react";

/** How wide a screen grows: `wide` for what spreads out (Home, the
 * Calendar, History), from the left edge; `reading` for a column of rows
 * and text, centred in the window so it leaves no empty side */
const WIDTHS = { wide: "max-w-[1440px]", reading: "mx-auto w-full max-w-3xl" };

/** A screen's page box, for a screen laid out without `Screen` (Exams) */
export const screenPage = (width: keyof typeof WIDTHS = "reading") =>
	cn("flex flex-col gap-6 px-8 pt-1 pb-10", WIDTHS[width]);

/** A screen's title, set large */
export function ScreenTitle({ className, ...props }: React.ComponentProps<"h1">) {
	return <h1 className={cn("font-bold text-title leading-tight", className)} {...props} />;
}

/**
 * A screen's page: its title set large at the top, as macOS apps do (the
 * title bar shows it small once it scrolls away), and its content under it
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
		<div className={cn(screenPage(width), className)}>
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
				<ScreenTitle className="flex-1">{title}</ScreenTitle>
				{actions}
			</header>
			{children}
		</div>
	);
}
