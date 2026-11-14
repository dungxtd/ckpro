import { Card } from "@ckpro/ui/components/card";
import { FadeScroll } from "@ckpro/ui/components/fade-scroll";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { Link } from "react-router";

/** A module's surface: its title, a link to the screen with all of it, then its content */
export function ModuleCard({
	title,
	link,
	className,
	children,
}: {
	title?: React.ReactNode;
	link?: { to: string; label: string };
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Card
			variant="tinted"
			padding="md"
			className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-2xl", className)}
		>
			{(title || link) && (
				<div className="mb-2 flex shrink-0 items-baseline gap-2">
					{title && <h2 className="min-w-0 truncate font-semibold text-callout">{title}</h2>}
					{link && (
						<Link
							to={link.to}
							className="ml-auto flex shrink-0 items-center text-caption text-highlight hover:underline"
						>
							{link.label}
							<ChevronRight className="size-3.5" />
						</Link>
					)}
				</div>
			)}
			{children}
		</Card>
	);
}

/** A list taller than its module: it scrolls, the next item fading at the edge */
export function ModuleScroll({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<FadeScroll axis="y" className={cn("min-h-0 flex-1 overscroll-contain", className)}>
			{children}
		</FadeScroll>
	);
}
