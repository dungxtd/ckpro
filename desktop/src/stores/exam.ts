import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
	ApiError,
	type CheckResult,
	type ExamState,
	type ExamSummary,
	examApi,
	type Mode,
	type Solution,
} from "@/tauri/api";

/** UI-only state of the current attempt; reset when a new attempt starts */
interface AttemptUi {
	attemptId: string | null;
	current: number;
	flagged: string[];
	hintsShown: Record<string, number>;
	checks: Record<string, CheckResult[] | "running">;
	solutions: Record<string, Solution>;
	/** Progress lines while the attempt is prepared (last 500) */
	log: string[];
}

interface ExamStore extends AttemptUi {
	/** Mirror of the Rust ExamState; null until the first snapshot arrives */
	state: ExamState | null;
	catalog: ExamSummary[];
	/** Exam waiting for confirmation to replace existing clusters */
	pendingReplace: { id: string; mode: Mode; message: string } | null;
	error: string | null;

	connect: () => Promise<() => void>;
	loadCatalog: () => Promise<void>;
	start: (id: string, mode: Mode, replace?: boolean) => Promise<void>;
	cancelReplace: () => void;
	submit: () => Promise<void>;
	end: () => Promise<void>;
	select: (index: number) => void;
	toggleFlag: (questionId: string) => void;
	showHint: (questionId: string) => void;
	check: (questionId: string) => Promise<void>;
	loadSolution: (questionId: string) => Promise<void>;
}

const freshAttempt = (attemptId: string | null): AttemptUi => ({
	attemptId,
	current: 0,
	flagged: [],
	hintsShown: {},
	checks: {},
	solutions: {},
	log: [],
});

const attemptId = (state: ExamState) => ("attempt" in state ? (state.attempt?.id ?? null) : null);
const message = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

export const useExam = create<ExamStore>()(
	devtools(
		immer((set, get) => ({
			...freshAttempt(null),
			state: null,
			catalog: [],
			pendingReplace: null,
			error: null,

			connect: async () => {
				const apply = (state: ExamState) =>
					set(s => {
						s.state = state;
						const id = attemptId(state);
						if (id && id !== s.attemptId) Object.assign(s, freshAttempt(id));
					});
				const unsubscribe = await examApi.subscribe(apply);
				const stopLog = await examApi.onLog(line =>
					set(s => {
						s.log.push(line);
						if (s.log.length > 500) s.log.splice(0, s.log.length - 500);
					})
				);
				apply(await examApi.state());
				return () => {
					unsubscribe();
					stopLog();
				};
			},

			loadCatalog: async () => {
				const catalog = await examApi.list();
				set(s => {
					s.catalog = catalog;
				});
			},

			start: async (id, mode, replace = false) => {
				set(s => {
					s.error = null;
					s.pendingReplace = null;
				});
				try {
					await examApi.start(id, mode, replace);
				} catch (e) {
					// The exam needs cluster names that are in use: ask first
					if (
						e instanceof ApiError &&
						e.code === "invalid" &&
						e.message.includes("already exists")
					) {
						set(s => {
							s.pendingReplace = { id, mode, message: e.message };
						});
					} else {
						set(s => {
							s.error = message(e);
						});
					}
				}
			},

			cancelReplace: () =>
				set(s => {
					s.pendingReplace = null;
				}),

			submit: async () => {
				try {
					await examApi.submit();
				} catch (e) {
					set(s => {
						s.error = message(e);
					});
				}
			},

			end: async () => {
				try {
					await examApi.end();
				} catch (e) {
					set(s => {
						s.error = message(e);
					});
				}
			},

			select: index =>
				set(s => {
					s.current = index;
				}),

			toggleFlag: questionId =>
				set(s => {
					s.flagged = s.flagged.includes(questionId)
						? s.flagged.filter(id => id !== questionId)
						: [...s.flagged, questionId];
				}),

			showHint: questionId =>
				set(s => {
					s.hintsShown[questionId] = (s.hintsShown[questionId] ?? 0) + 1;
				}),

			check: async questionId => {
				set(s => {
					s.checks[questionId] = "running";
				});
				try {
					const results = await examApi.check(questionId);
					set(s => {
						s.checks[questionId] = results;
					});
				} catch (e) {
					set(s => {
						delete s.checks[questionId];
						s.error = message(e);
					});
				}
			},

			loadSolution: async questionId => {
				if (get().solutions[questionId]) return;
				try {
					const solution = await examApi.solution(questionId);
					set(s => {
						s.solutions[questionId] = solution;
					});
				} catch (e) {
					set(s => {
						s.error = message(e);
					});
				}
			},
		})),
		{ name: "ckdry-exam", enabled: import.meta.env.DEV }
	)
);
