import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";

/** A data table in a card: header row tinted, rows separated by hairlines. */
function Table({ className, ...props }: React.ComponentProps<"table">) {
	return (
		<div data-slot="table" className="overflow-hidden rounded-xl border border-border bg-card">
			<table className={cn("w-full text-sm", className)} {...props} />
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			className={cn(
				"bg-muted/50 text-left text-caption text-muted-foreground leading-4",
				className
			)}
			{...props}
		/>
	);
}

function TableBody({ ...props }: React.ComponentProps<"tbody">) {
	return <tbody {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return <tr className={cn("[tbody_&]:border-border [tbody_&]:border-t", className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return <th className={cn("px-3 py-2 font-medium", className)} {...props} />;
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return <td className={cn("px-3 py-2", className)} {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
