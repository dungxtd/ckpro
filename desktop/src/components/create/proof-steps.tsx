import { Button } from "@cktry/ui/components/button";
import { disclosureRow } from "@cktry/ui/components/disclosure";
import { Popover, PopoverContent, PopoverTrigger } from "@cktry/ui/components/popover";
import { Spinner } from "@cktry/ui/components/spinner";
import { Terminal } from "@cktry/ui/components/terminal";
import { useFollow } from "@cktry/ui/hooks/use-follow";
import { useNow } from "@cktry/ui/hooks/use-now";
import { clock } from "@cktry/ui/lib/time";
import { cn } from "@cktry/ui/lib/utils";
import { Check, ChevronRight, Circle, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ActivityProgress } from "@/components/activity/activity-progress";
import { useActivities } from "@/stores/activity";
import { useStudio } from "@/stores/studio";
import type { Proof } from "@/tauri/api";
import { plural } from "@/words";
import { QuestionScripts } from "./question-scripts";

/** A step of the activity's plan logs `▸ <step>` as it starts */
const MARK = "▸ ";

/** Each step's lines: those after its mark, the marks in the plan's order */
function stepLogs(steps: string[], log: string[]) {
	const logs: string[][] = steps.map(() => []);
	let at = 0;
	for (const line of log) {
		if (line.startsWith(MARK)) {
			const next = steps.indexOf(line.slice(MARK.length), at);
			if (next >= 0) {
				at = next;
				continue;
			}
		}
		logs[at]?.push(line);
	}
	return logs;
}

/**
 * The proof's plan, step by step (its cluster, the setups, each question
 * checked): how each went and how long it took, and its own log, opened by
 * a press. A step that failed opens by itself, so does the one running
 * (following its newest lines); the whole log is a press away, to copy
 */
export function ProofSteps({ proof }: { proof: Proof }) {
	const activity = useActivities(s => s.byId[proof.activity]);
	const [opened, setOpened] = useState<Record<number, boolean>>({});
	const running = !proof.ended_at;
	const now = useNow(running);
	// Split again when lines come, not on each tick of the clock
	const logs = useMemo(() => (activity ? stepLogs(activity.steps, activity.log) : []), [activity]);
	if (!activity) return null;

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
								disclosureRow,
								"w-full py-1 text-callout disabled:hover:bg-transparent",
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
	const box = useFollow<HTMLPreElement>(follow ? lines.length : 0);
	return (
		<Terminal ref={box} size="sm" className="mt-0.5 mb-1.5 ml-6 max-h-40">
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
		</Terminal>
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
		`Make a cluster with ${plural(workers, "worker")}`,
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

/**
 * The scripts of the questions Claude wrote, each a press away: they run in
 * a throwaway cluster held to the script rules, so reading them is a choice,
 * and their solutions stay folded even then
 */
export function NewScripts() {
	const draft = useStudio(s => s.draft);
	const [open, setOpen] = useState<string | null>(null);
	const fresh = (draft?.items ?? []).flatMap(i => (i.kind === "new" ? [i] : []));
	if (fresh.length === 0) return null;
	return (
		<div className="mt-3 flex flex-col gap-1 border-border border-t pt-3">
			<span className="px-1.5 font-bold text-2xs text-muted-foreground tracking-wide">
				CLAUDE'S QUESTIONS
			</span>
			<span className="px-1.5 text-caption text-muted-foreground">
				They run in a cluster made for the proof: their scripts reach only it, its task host and the
				sources the packs use, and it is removed after. Nothing to read before.
			</span>
			{fresh.map(q => (
				<div key={q.key}>
					<button
						type="button"
						aria-expanded={open === q.key}
						onClick={() => setOpen(o => (o === q.key ? null : q.key))}
						className={cn(disclosureRow, "w-full py-1 text-callout")}
					>
						<span className="min-w-0 flex-1 truncate">{q.title}</span>
						<span className="text-caption text-muted-foreground">
							{open === q.key ? "Hide scripts" : "Show scripts"}
						</span>
					</button>
					{open === q.key && (
						<div className="mt-1 mb-2 ml-1.5">
							<QuestionScripts yaml={q.yaml} />
						</div>
					)}
				</div>
			))}
		</div>
	);
}
