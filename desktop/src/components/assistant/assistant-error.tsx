import { Alert } from "@ckpro/ui/components/alert";
import { Button } from "@ckpro/ui/components/button";
import { cn } from "@ckpro/ui/lib/utils";
import { CircleAlert } from "lucide-react";

/**
 * What went wrong with the assistant: a plain sentence first, what the
 * agent or the app said under it (it can be long, and technical), and Try
 * again when what failed was an answer, asking the same once more
 */
export function AssistantError({
	error,
	onRetry,
	size = "md",
	className,
}: {
	error: string;
	/** Ask the failed question again; none when what failed was not an answer */
	onRetry?: () => void;
	size?: "sm" | "md";
	className?: string;
}) {
	return (
		<Alert variant="destructive" size={size} className={className}>
			<CircleAlert />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="font-medium">
					{onRetry ? "The assistant could not answer." : "The assistant could not do that."}
				</span>
				<span className={cn("break-words text-muted-foreground", size === "md" && "text-caption")}>
					{error}
				</span>
				{onRetry && (
					<Button size="push" variant="push" className="mt-1 self-start" onClick={onRetry}>
						Try again
					</Button>
				)}
			</div>
		</Alert>
	);
}
