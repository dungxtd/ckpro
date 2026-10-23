import { Button } from "@ckdry/ui/components/button";
import { Navigate } from "react-router";
import { Results } from "@/components/exam/results";
import { RunningExam } from "@/components/exam/running-exam";
import { useExam } from "@/stores/exam";

function Progress({
	title,
	step,
	done,
	total,
	onCancel,
}: {
	title: string;
	step: string;
	done: number;
	total: number;
	onCancel?: () => void;
}) {
	const percent = total === 0 ? 0 : Math.round((done / total) * 100);
	return (
		<div className="flex h-full items-center justify-center">
			<section className="w-[420px] rounded-lg border border-border bg-card p-6">
				<div className="font-semibold">{title}</div>
				<div className="mt-1 text-muted-foreground text-sm">{step}</div>
				<div className="mt-4 h-2 overflow-hidden rounded bg-muted">
					<div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
				</div>
				<div className="mt-2 flex items-center text-muted-foreground text-xs">
					<span>
						{done}/{total}
					</span>
					{onCancel && (
						<Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
							Cancel
						</Button>
					)}
				</div>
			</section>
		</div>
	);
}

/** The current attempt, whatever phase it is in. */
export function ExamRoute() {
	const { state, end } = useExam();
	if (!state) return null;

	switch (state.phase) {
		case "idle":
			return <Navigate to="/" replace />;
		case "preparing":
			return (
				<Progress
					title={`Preparing ${state.attempt.title}`}
					step={state.step}
					done={state.done}
					total={state.total}
					onCancel={end}
				/>
			);
		case "running":
			return (
				<RunningExam
					attempt={state.attempt}
					startedAt={state.started_at ?? Date.now()}
					endsAt={state.ends_at ?? null}
				/>
			);
		case "grading":
			return (
				<Progress
					title="Grading"
					step="Running every check"
					done={state.done}
					total={state.total}
				/>
			);
		case "finished":
			return <Results attempt={state.attempt} result={state.result} />;
		case "failed":
			return (
				<div className="flex h-full items-center justify-center">
					<section className="w-[480px] rounded-lg border border-red-500/50 bg-card p-6">
						<div className="font-semibold">The exam could not run</div>
						<div className="mt-2 text-sm">{state.message}</div>
						<Button className="mt-4" variant="outline" onClick={end}>
							Close and clean up
						</Button>
					</section>
				</div>
			);
	}
}
