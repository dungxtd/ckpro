import { Spinner } from "@ckdry/ui/components/spinner";
import { cn } from "@ckdry/ui/lib/utils";

/**
 * Something is on its way: a spinner and what is awaited. `fill` takes the
 * whole area it is in and centres itself (a page, a panel, the app at start);
 * otherwise it is one quiet line. It appears only after a moment, so a wait
 * that ends at once shows nothing.
 */
export function Loading({
	label,
	fill,
	className,
}: {
	label?: string;
	fill?: boolean;
	className?: string;
}) {
	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"flex animate-loading-in items-center gap-2 text-muted-foreground text-sm",
				fill && "h-full min-h-32 w-full flex-col justify-center gap-3",
				className
			)}
		>
			<Spinner size={fill ? "small" : "inline"} className="text-muted-foreground" />
			{label && <span>{label}</span>}
		</div>
	);
}
