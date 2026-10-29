import { Card } from "@ckdry/ui/components/card";
import { cn } from "@ckdry/ui/lib/utils";
import type { ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
	return <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">{children}</div>;
}

// ---- AI ---------------------------------------------------------------------

/** A titled group of rows on one card, like a System Settings section */
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
		<section className="flex flex-col gap-2">
			<div className="px-1">
				<h2 className="font-semibold text-sm">{title}</h2>
				{description && <p className="text-muted-foreground text-xs">{description}</p>}
			</div>
			<Card padding="none" className="divide-y divide-border">
				{children}
			</Card>
		</section>
	);
}

/** One setting: its name (and a line about it) left, its control right */
export function Row({
	label,
	detail,
	className,
	children,
}: {
	label: string;
	detail?: string;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div className={cn("flex min-h-12 items-center justify-between gap-4 px-4 py-2", className)}>
			<div className="min-w-0">
				<div className="text-sm">{label}</div>
				{detail && <div className="text-muted-foreground text-xs">{detail}</div>}
			</div>
			{children && <div className="shrink-0">{children}</div>}
		</div>
	);
}
