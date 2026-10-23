import { Button } from "@ckdry/ui/components/button";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, ChevronDown, ChevronRight, Circle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useExam } from "@/stores/exam";
import type { Attempt } from "@/tauri/api";

const clock = (ms: number) => {
	const s = Math.floor(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Setting up the exam environment: the whole plan with where it is, the time
 * so far, and the live log (cluster creation, image builds, task setups).
 */
export function Preparing({
	attempt,
	steps,
	current,
	detail,
}: {
	attempt: Attempt;
	steps: string[];
	current: number;
	detail: string | null;
}) {
	const { log, end } = useExam();
	const [since] = useState(Date.now());
	const [now, setNow] = useState(Date.now());
	const [showLog, setShowLog] = useState(true);
	const logBox = useRef<HTMLPreElement>(null);
	const following = useRef(true);

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);

	// Follow new lines unless the reader scrolled up
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on every new line
	useEffect(() => {
		const el = logBox.current;
		if (el && following.current) el.scrollTop = el.scrollHeight;
	}, [log.length]);

	const percent = Math.round((current / steps.length) * 100);

	return (
		<div className="flex h-full items-center justify-center overflow-auto p-6">
			<section className="w-full max-w-2xl rounded-lg border border-border bg-card p-6">
				<div className="flex items-baseline gap-3">
					<div>
						<div className="font-semibold text-lg">Setting up your exam environment</div>
						<div className="text-muted-foreground text-sm">
							{attempt.title} · {attempt.mode === "exam" ? "Exam" : "Practice"} mode
						</div>
					</div>
					<span className="ml-auto font-mono text-muted-foreground text-sm tabular-nums">
						{clock(now - since)}
					</span>
				</div>

				<div className="mt-4 h-2 overflow-hidden rounded bg-muted">
					<div
						className="h-full bg-primary transition-all duration-500"
						style={{ width: `${percent}%` }}
					/>
				</div>
				<div className="mt-1 text-muted-foreground text-xs">
					Step {Math.min(current + 1, steps.length)} of {steps.length}
				</div>

				<ol className="mt-4 flex flex-col gap-2">
					{steps.map((step, i) => (
						<li key={step} className="flex gap-2 text-sm">
							{i < current ? (
								<Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
							) : i === current ? (
								<Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
							) : (
								<Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
							)}
							<div className={cn(i > current && "text-muted-foreground")}>
								<div className={cn(i === current && "font-medium")}>{step}</div>
								{i === current && detail && (
									<div className="text-muted-foreground text-xs">{detail}</div>
								)}
							</div>
						</li>
					))}
				</ol>

				<div className="mt-4">
					<button
						type="button"
						className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
						onClick={() => setShowLog(!showLog)}
					>
						{showLog ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
						Log ({log.length} lines)
					</button>
					{showLog && (
						<pre
							ref={logBox}
							onScroll={e => {
								const el = e.currentTarget;
								following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
							}}
							className="mt-2 h-56 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300 leading-relaxed"
						>
							{log.length === 0 ? "Waiting for output…" : log.join("\n")}
						</pre>
					)}
				</div>

				<div className="mt-4 flex">
					<Button size="sm" variant="ghost" className="ml-auto" onClick={end}>
						Cancel
					</Button>
				</div>
			</section>
		</div>
	);
}
