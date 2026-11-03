import { Button } from "@ckpro/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { Spinner } from "@ckpro/ui/components/spinner";
import { cn } from "@ckpro/ui/lib/utils";
import { Check, ChevronRight, Circle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActivityProgress, clock } from "@/components/activity/activity-progress";
import { useActivities } from "@/stores/activity";
import { useStudio } from "@/stores/studio";
import type { Proof } from "@/tauri/api";

/** A step of the activity's plan logs `▸ <step>` as it starts */
const MARK = "▸ ";

/**
 * The proof's plan, step by step (its cluster, the setups, each question
 * checked): how each went and how long it took, and its own log, opened by
 * a press. A step that failed opens by itself, so does the one running
 * (following its newest lines); the whole log is a press away, to copy
 */
export function ProofSteps({ proof }: { proof: Proof }) {
	const activity = useActivities(s => s.byId[proof.activity]);
	const [opened, setOpened] = useState<Record<number, boolean>>({});
	const [now, setNow] = useState(Date.now);
	const running = !proof.ended_at;
	useEffect(() => {
		if (!running) return;
		const tick = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(tick);
	}, [running]);
	if (!activity) return null;

	// Each step's lines: those after its mark, the marks in the plan's order
	const logs: string[][] = activity.steps.map(() => []);
	let at = 0;
	for (const line of activity.log) {
		if (line.startsWith(MARK)) {
			const next = activity.steps.indexOf(line.slice(MARK.length), at);
			if (next >= 0) {
				at = next;
				continue;
			}
		}
		logs[at]?.push(line);
	}
	const marks = proof.marks.map(m => m ?? 0);
	const current = marks.length - 1;
	const stopped = !!proof.ended_at && activity.status === "failed";
	const state = (i: number): "done" | "failed" | "running" | "waiting" => {
		if (i > current) return "waiting";
		// A question checked: its result
		const result = i >= 2 ? proof.results.find(r => r.key === proof.checking[i - 2]) : undefined;
		if (result) return result.status.state === "proven" ? "done" : "failed";
		if (i < current) return "done";
		if (stopped) return "failed";
		return running ? "running" : "done";
	};
	const took = (i: number) => {
		if (i > current) return null;
		const end = i < current ? marks[i + 1] : (proof.ended_at ?? now);
		return clock(end - marks[i]);
	};

	return (
		<div className="flex flex-col gap-0.5">
			{activity.steps.map((title, i) => {
				const s = state(i);
				const open = opened[i] ?? (s === "failed" || s === "running");
				const lines =
					s === "failed" && i === current && activity.error
						? [...logs[i], activity.error]
						: logs[i];
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: the plan's steps are fixed
					<div key={i}>
						<button
							type="button"
							disabled={lines.length === 0}
							aria-expanded={open}
							onClick={() => setOpened(o => ({ ...o, [i]: !open }))}
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-callout outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent",
								s === "running" && "font-semibold",
								s === "waiting" && "text-muted-foreground"
							)}
						>
							<StepIcon state={s} />
							<span className="min-w-0 flex-1 truncate">{title}</span>
							<span className="text-caption text-muted-foreground tabular-nums">{took(i)}</span>
							<ChevronRight
								className={cn(
									"size-3.5 text-muted-foreground transition-transform",
									open && "rotate-90",
									lines.length === 0 && "invisible"
								)}
							/>
						</button>
						{open && lines.length > 0 && <StepLog lines={lines} follow={s === "running"} />}
					</div>
				);
			})}
			<Popover>
				<PopoverTrigger asChild>
					<Button size="push" variant="quiet" className="mt-1 self-start">
						Full log
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" side="top" className="w-[28rem]">
					<ActivityProgress id={proof.activity} compact />
				</PopoverContent>
			</Popover>
		</div>
	);
}

function StepIcon({ state }: { state: "done" | "failed" | "running" | "waiting" }) {
	if (state === "running") return <Spinner size="inline" className="size-3.5 text-highlight" />;
	if (state === "done") return <Check className="size-3.5 shrink-0 text-success" />;
	if (state === "failed") return <X className="size-3.5 shrink-0 text-destructive" />;
	return <Circle className="size-3 shrink-0 text-muted-foreground" />;
}

/** A step's lines; the running one's follow its newest unless scrolled up */
function StepLog({ lines, follow }: { lines: string[]; follow: boolean }) {
	const box = useRef<HTMLPreElement>(null);
	const stuck = useRef(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: follows every new line
	useEffect(() => {
		if (follow && stuck.current) box.current?.scrollTo({ top: box.current.scrollHeight });
	}, [lines.length, follow]);
	return (
		<pre
			ref={box}
			onScroll={e => {
				const el = e.currentTarget;
				stuck.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
			}}
			className="mt-0.5 mb-1.5 ml-6 max-h-40 select-text overflow-auto whitespace-pre-wrap break-words rounded-md bg-foreground/[0.04] px-2.5 py-2 font-mono text-[11px] text-muted-foreground leading-relaxed"
		>
			{lines.map((line, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: lines only grow
					key={i}
					className={cn(
						"block",
						/\bWARNING\b|warning:/i.test(line) && "text-warning",
						/^Error\b|\berror:|failed/i.test(line) && "text-destructive"
					)}
				>
					{line}
				</span>
			))}
		</pre>
	);
}

/**
 * The proof to come, before the first: its steps (a cluster as big as the
 * exam needs, the setups, each question to check) and about how long
 */
export function ProofPreview() {
	const draft = useStudio(s => s.draft);
	const plan = useStudio(s => s.plan);
	const checking = (draft?.items ?? []).filter(i => i.status.state !== "proven");
	const workers = plan?.workers ?? 1;
	const steps = [
		`Make a cluster with ${workers} worker${workers === 1 ? "" : "s"}`,
		"Set up every question",
		...checking.map(i => i.title),
	];
	return (
		<div className="flex flex-col gap-0.5">
			<span className="mb-1 px-1.5 text-caption text-muted-foreground">
				Not run yet: about {plan ? plan.minutes_changed : "?"} min, its cluster removed after
			</span>
			{steps.map(title => (
				<div
					key={title}
					className="flex items-center gap-2 px-1.5 py-1 text-callout text-muted-foreground"
				>
					<Circle className="size-3 shrink-0" />
					<span className="min-w-0 flex-1 truncate">{title}</span>
				</div>
			))}
		</div>
	);
}
