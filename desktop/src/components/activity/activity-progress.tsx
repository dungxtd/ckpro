import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { CodeBlock } from "@ckdry/ui/components/code-block";
import { Spinner } from "@ckdry/ui/components/spinner";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, ChevronDown, ChevronRight, Circle, Copy, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useActivities } from "@/stores/activity";

/** A step running longer than this opens the log: something slow is going on */
const SLOW_STEP_MS = 30_000;

export const clock = (ms: number) => {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

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
	const [now, setNow] = useState(Date.now());
	const [stepSince, setStepSince] = useState(Date.now());
	const [userOpen, setUserOpen] = useState<boolean | null>(null);
	const logBox = useRef<HTMLPreElement>(null);
	const following = useRef(true);
	const running = activity?.status === "running";

	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [running]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: restart the slow-step clock on each step
	useEffect(() => setStepSince(Date.now()), [activity?.current]);

	// Follow new lines unless the reader scrolled up
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on every new line
	useEffect(() => {
		const el = logBox.current;
		if (el && following.current) el.scrollTop = el.scrollHeight;
	}, [activity?.log.length]);

	if (!activity) {
		return <div className="text-muted-foreground text-sm">Starting…</div>;
	}

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
				<div
					role="progressbar"
					aria-valuenow={percent}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={activity.title}
					className="h-2 overflow-hidden rounded-full bg-muted"
				>
					<div
						className={cn(
							"h-full transition-all duration-500",
							failed ? "bg-destructive" : "bg-highlight"
						)}
						style={{ width: `${failed ? Math.max(percent, 4) : percent}%` }}
					/>
				</div>
				{total > 1 && (
					<div className="mt-1 text-muted-foreground text-xs">
						{done ? "Done" : `Step ${Math.min(activity.current + 1, total)} of ${total}`}
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
									<div className="text-muted-foreground text-xs">{activity.detail}</div>
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
						Log ({activity.log.length} lines)
					</Button>
					{open && activity.log.length > 0 && (
						<Button
							size="push"
							variant="ghost"
							className="ml-auto text-muted-foreground"
							onClick={() => navigator.clipboard.writeText(activity.log.join("\n"))}
						>
							<Copy /> Copy log
						</Button>
					)}
				</div>
				{open && (
					<CodeBlock
						wrap
						ref={logBox}
						onScroll={e => {
							const el = e.currentTarget;
							following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
						}}
						className={cn("mt-2 p-3 text-[11px] leading-relaxed", compact ? "h-40" : "h-56")}
					>
						{activity.log.length === 0 ? "Waiting for output…" : activity.log.join("\n")}
					</CodeBlock>
				)}
			</div>

			{children && <div className="flex justify-end gap-2">{children}</div>}
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
