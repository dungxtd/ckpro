import { Alert } from "@ckpro/ui/components/alert";
import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { CodeBlock } from "@ckpro/ui/components/code-block";
import { Progress } from "@ckpro/ui/components/progress";
import { Spinner } from "@ckpro/ui/components/spinner";
import { useFollow } from "@ckpro/ui/hooks/use-follow";
import { useNow } from "@ckpro/ui/hooks/use-now";
import { clock } from "@ckpro/ui/lib/time";
import { cn } from "@ckpro/ui/lib/utils";
import { Check, ChevronDown, ChevronRight, Circle, Copy, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { useActivities } from "@/stores/activity";
import { plural } from "@/words";

/** A step running longer than this opens the log: something slow is going on */
const SLOW_STEP_MS = 30_000;

/**
 * Any long operation the user waits on (preparing or cleaning up an exam,
 * grading, resuming, cluster changes): the plan with where it is, elapsed
 * time, and the log. The log is folded away unless it matters: it opens when
 * the operation fails or a step runs long (a first image build), and a
 * failure shows its error with the log to copy.
 */
export function ActivityProgress({
	id,
	subtitle,
	note,
	children,
	compact = false,
}: {
	id: number;
	subtitle?: string;
	/** Shown above the steps, e.g. why this started */
	note?: string;
	/** Actions (Cancel, Retry…) */
	children?: ReactNode;
	compact?: boolean;
}) {
	const activity = useActivities(s => s.byId[id]);
	const [stepSince, setStepSince] = useState(Date.now());
	const [userOpen, setUserOpen] = useState<boolean | null>(null);
	const running = activity?.status === "running";
	const now = useNow(running);

	// biome-ignore lint/correctness/useExhaustiveDependencies: restart the slow-step clock on each step
	useEffect(() => setStepSince(Date.now()), [activity?.current]);

	// Opened at its newest lines, following them unless the reader scrolled up
	const showLog = useFollow<HTMLPreElement>(activity?.log.length);

	if (!activity) return <ProgressSkeleton compact={compact} />;

	const failed = activity.status === "failed";
	const done = activity.status === "done";
	const elapsed = (activity.finished_at ?? now) - (activity.started_at ?? now);
	const slow = running && now - stepSince > SLOW_STEP_MS;
	const open = userOpen ?? (failed || slow);
	const total = activity.steps.length;
	const percent = done ? 100 : total === 0 ? 0 : Math.round((activity.current / total) * 100);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-baseline gap-3">
				<div className="min-w-0">
					<div className={cn("truncate font-semibold", !compact && "text-lg")}>
						{activity.title}
					</div>
					{subtitle && <div className="text-muted-foreground text-sm">{subtitle}</div>}
				</div>
				<span className="ml-auto font-mono text-muted-foreground text-sm tabular-nums">
					{clock(elapsed)}
				</span>
			</div>

			{note && <Alert variant="warning">{note}</Alert>}

			<div>
				<Progress
					label={activity.title}
					value={failed ? Math.max(percent, 4) : percent}
					tone={failed ? "destructive" : "highlight"}
					size="md"
				/>
				{total > 1 && (
					<div className="mt-1 text-caption text-muted-foreground tabular-nums">
						{done
							? "Done"
							: activity.status === "cancelled"
								? `Cancelled at step ${Math.min(activity.current + 1, total)} of ${total}`
								: `Step ${Math.min(activity.current + 1, total)} of ${total}`}
					</div>
				)}
			</div>

			<ol className="flex flex-col gap-1.5">
				{activity.steps.map((step, i) => {
					const isCurrent = i === activity.current && !done;
					return (
						<li key={step} className="flex gap-2 text-sm">
							{i < activity.current || done ? (
								<Check className="mt-0.5 size-4 shrink-0 text-success" />
							) : isCurrent && failed ? (
								<X className="mt-0.5 size-4 shrink-0 text-destructive" />
							) : isCurrent ? (
								<Spinner size="inline" className="mt-0.5 shrink-0 text-highlight" />
							) : (
								<Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
							)}
							<div className={cn(i > activity.current && !done && "text-muted-foreground")}>
								<div className={cn(isCurrent && "font-medium")}>{step}</div>
								{isCurrent && activity.detail && (
									<div className="text-muted-foreground text-caption">{activity.detail}</div>
								)}
							</div>
						</li>
					);
				})}
			</ol>

			{failed && activity.error && <Alert variant="destructive">{activity.error}</Alert>}

			<div>
				<div className="flex items-center gap-2">
					<Button
						size="push"
						variant="ghost"
						className="text-muted-foreground"
						aria-expanded={open}
						onClick={() => setUserOpen(!open)}
					>
						{open ? <ChevronDown /> : <ChevronRight />}
						Log ({plural(activity.log.length, "line")})
					</Button>
					{open && activity.log.length > 0 && (
						<Button
							size="push"
							variant="ghost"
							className="ml-auto text-muted-foreground"
							onClick={() =>
								navigator.clipboard.writeText(activity.log.join("\n")).then(
									() => toast.success("Log copied", { duration: 1500 }),
									() => toast.error("Could not copy the log")
								)
							}
						>
							<Copy /> Copy log
						</Button>
					)}
				</div>
				{open && (
					<CodeBlock
						wrap
						ref={showLog}
						className={cn("mt-2 p-3 text-2xs leading-relaxed", compact ? "h-40" : "h-56")}
					>
						{activity.log.length === 0 ? "Waiting for output…" : activity.log.join("\n")}
					</CodeBlock>
				)}
			</div>

			{children && <div className="flex justify-end gap-2">{children}</div>}
		</div>
	);
}

/** What the progress will show, before its first word comes (it is being
 * started): the title, the bar and a few steps, so nothing jumps when it does */
function ProgressSkeleton({ compact }: { compact: boolean }) {
	return (
		<div aria-busy className="flex flex-col gap-3">
			<span className="sr-only">Starting…</span>
			<span
				className={cn("w-48 animate-pulse rounded-full bg-fill-quiet", compact ? "h-4" : "h-5")}
			/>
			<span className="h-2 animate-pulse rounded-full bg-fill-quiet" />
			<span className="flex flex-col gap-2.5 py-0.5">
				{["w-40", "w-56", "w-32"].map(w => (
					<span key={w} className="flex items-center gap-2">
						<span className="size-4 shrink-0 animate-pulse rounded-full bg-fill-quiet" />
						<span className={cn("h-3 animate-pulse rounded-full bg-fill-quiet", w)} />
					</span>
				))}
			</span>
		</div>
	);
}

/** The progress card, centred on the page */
export function ActivityPage(props: Parameters<typeof ActivityProgress>[0]) {
	return (
		<div className="flex h-full items-center justify-center overflow-auto p-6">
			<Card padding="lg" className="w-full max-w-2xl">
				<ActivityProgress {...props} />
			</Card>
		</div>
	);
}
