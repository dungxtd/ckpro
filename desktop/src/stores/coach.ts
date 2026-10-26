import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { ApiError, type CheckResult, type CoachMessage, coachApi } from "@/tauri/api";
import { useExam } from "./exam";

/** The practice coach: one conversation per question of the attempt (kept in
 * the app database by Rust), and whether the task panel shows it */
interface CoachStore {
	/** The task panel shows the coach instead of the task */
	open: boolean;
	/** Conversations of the current attempt, by question */
	threads: Record<string, CoachMessage[]>;
	attemptId: string | null;
	/** The question whose answer is being written */
	writing: string | null;
	/** Claude Code missing, or the last question failed */
	error: string | null;
	setOpen: (open: boolean) => void;
	load: (questionId: string) => Promise<void>;
	/** `checks`: the ones to explain (the result's in review), else the last "Check my work" */
	ask: (questionId: string, text: string, checks?: CheckResult[]) => Promise<void>;
	stop: () => void;
}

/** Another attempt: its own conversations */
const forAttempt = (s: CoachStore) => {
	const attemptId = useExam.getState().attemptId;
	if (s.attemptId !== attemptId) {
		s.attemptId = attemptId;
		s.threads = {};
		s.error = null;
	}
};

export const useCoach = create<CoachStore>()(
	immer((set, get) => ({
		open: false,
		threads: {},
		attemptId: null,
		writing: null,
		error: null,
		setOpen: open => set({ open }),
		load: async questionId => {
			set(forAttempt);
			if (get().threads[questionId]) return;
			try {
				const messages = await coachApi.history(questionId);
				set(s => {
					s.threads[questionId] ??= messages;
				});
			} catch (e) {
				set({ error: e instanceof ApiError ? e.message : String(e) });
			}
		},
		ask: async (questionId, text, given) => {
			set(forAttempt);
			if (get().writing) coachApi.cancel();
			const { checks, solutions } = useExam.getState();
			const checked = checks[questionId];
			set(s => {
				s.open = true;
				s.error = null;
				s.writing = questionId;
				s.threads[questionId] = [
					...(s.threads[questionId] ?? []),
					{ role: "user", text },
					{ role: "assistant", text: "" },
				];
			});
			// Appends to the answer being written (the last message)
			const append = (t: string) =>
				set(s => {
					const thread = s.threads[questionId];
					const last = thread?.[thread.length - 1];
					if (last?.role === "assistant") last.text += t;
				});
			try {
				const answer = await coachApi.ask(
					questionId,
					text,
					given ?? (Array.isArray(checked) ? checked : []),
					questionId in solutions,
					append
				);
				set(s => {
					const thread = s.threads[questionId];
					const last = thread?.[thread.length - 1];
					if (last?.role === "assistant") last.text = answer;
				});
			} catch (e) {
				const stopped = e instanceof ApiError && e.code === "cancelled";
				set(s => {
					// A stopped or failed answer is not kept (Rust keeps only complete ones)
					const thread = s.threads[questionId];
					if (
						thread?.[thread.length - 1]?.role === "assistant" &&
						(stopped || !thread[thread.length - 1]?.text)
					)
						thread.splice(-2, 2);
					if (!stopped) s.error = e instanceof ApiError ? e.message : String(e);
				});
			} finally {
				set(s => {
					if (s.writing === questionId) s.writing = null;
				});
			}
		},
		stop: () => {
			coachApi.cancel();
		},
	}))
);
