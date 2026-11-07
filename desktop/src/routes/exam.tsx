import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { Loading } from "@ckpro/ui/components/loading";
import { Navigate } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ActivityPage } from "@/components/activity/activity-progress";
import { Grading } from "@/components/exam/grading";
import { Results } from "@/components/exam/results";
import { RunningExam } from "@/components/exam/running-exam";
import { WindowFrame } from "@/components/shell/window";
import { useExam } from "@/stores/exam";

const modeLabel = (mode: string) => (mode === "exam" ? "Exam mode" : "Practice mode");

/** The current attempt, whatever phase it is in. The desk has its own top
 * bar beside the window's buttons; the other phases sit under a bar that
 * moves the window */
export function ExamRoute() {
	const running = useExam(s => s.state?.phase === "running");
	return running ? (
		<ExamPhase />
	) : (
		<WindowFrame>
			<ExamPhase />
		</WindowFrame>
	);
}

function ExamPhase() {
	const {
		state,
		end,
		start,
		retry: tryAgain,
	} = useExam(useShallow(s => ({ state: s.state, end: s.end, start: s.start, retry: s.retry })));
	if (!state) return <Loading fill label="Loading the exam…" />;

	switch (state.phase) {
		case "idle":
			return <Navigate to="/" replace />;
		case "preparing":
			return (
				<ActivityPage id={state.activity} subtitle={modeLabel(state.attempt.mode)}>
					<Button size="sm" variant="ghost" onClick={end}>
						Cancel
					</Button>
				</ActivityPage>
			);
		case "resuming":
			return (
				<ActivityPage
					id={state.activity}
					subtitle={state.attempt.title}
					note="ckpro was closed during this exam. Its clusters and desktop are starting again; the exam timer kept running."
				/>
			);
		case "running":
			return (
				<RunningExam
					attempt={state.attempt}
					startedAt={state.started_at}
					endsAt={state.ends_at ?? null}
				/>
			);
		case "grading":
			return (
				<Grading
					attempt={state.attempt}
					activity={state.activity}
					scores={state.scores}
					note={state.note ?? null}
				/>
			);
		case "ending":
			return <ActivityPage id={state.activity} subtitle={state.attempt.title} />;
		case "finished":
			return (
				<div className="h-full overflow-auto">
					<Results attempt={state.attempt} result={state.result} />
				</div>
			);
		case "failed": {
			const attempt = state.attempt;
			// Kept (its resume or grading failed): the same attempt, the work on it
			// intact. Else a new attempt of the exam
			const retry = state.resumable
				? tryAgain
				: attempt
					? async () => {
							await end();
							await start(attempt.exam_id, attempt.mode, true);
						}
					: undefined;
			const actions = (
				<>
					<Button size="sm" variant="outline" onClick={end}>
						Close and clean up
					</Button>
					{retry && (
						<Button size="sm" variant="pushDefault" onClick={retry}>
							{state.resumable ? "Try Again" : "Start Over"}
						</Button>
					)}
				</>
			);
			return state.activity != null ? (
				<ActivityPage id={state.activity} subtitle={attempt?.title}>
					{actions}
				</ActivityPage>
			) : (
				<div className="flex h-full items-center justify-center">
					<Card padding="lg" className="w-[480px] border-destructive/50">
						<div className="font-semibold">The exam could not run</div>
						<div className="mt-2 text-sm">{state.message}</div>
						<div className="mt-4 flex justify-end gap-2">{actions}</div>
					</Card>
				</div>
			);
		}
	}
}
