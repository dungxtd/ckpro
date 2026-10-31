import { Card } from "@ckdry/ui/components/card";
import { cn } from "@ckdry/ui/lib/utils";
import type { ReactNode } from "react";

/** A titled group of rows on one card, as macOS settings group them: its
 * name above, a line about it under the card */
export function Group({
	title,
	description,
	children,
}: {
	title: ReactNode;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-1.5">
			<h2 className="px-1 font-semibold text-caption text-muted-foreground">{title}</h2>
			<Card padding="none" className="divide-y divide-border">
				{children}
			</Card>
			{description && <p className="px-1 text-caption text-muted-foreground">{description}</p>}
		</section>
	);
}

/** One setting: its icon and name (and a line about it) left, its control right */
export function Row({
	icon,
	label,
	detail,
	className,
	children,
}: {
	icon?: ReactNode;
	label: string;
	detail?: string;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex min-h-12 items-center justify-between gap-4 px-4 py-2 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
				className
			)}
		>
			{icon}
			<div className="min-w-0 flex-1">
				<div className="text-lead">{label}</div>
				{detail && <div className="text-caption text-muted-foreground">{detail}</div>}
			</div>
			{children && <div className="shrink-0">{children}</div>}
		</div>
	);
}
