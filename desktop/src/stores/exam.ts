import { toast } from "sonner";
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
	progressApi,
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
	/** Solutions hidden again (they stay opened: the coach knows they were seen) */
	solutionHidden: Record<string, boolean>;
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
	/** Show the solution (opening it the first time), or hide it again */
	toggleSolution: (questionId: string) => void;
}

const freshAttempt = (attemptId: string | null): AttemptUi => ({
	attemptId,
	current: 0,
	flagged: [],
	hintsShown: {},
	checks: {},
	solutions: {},
	solutionHidden: {},
});

/** Where the candidate is, what they flagged and the hints they opened go to
 * the app database, so they survive quitting mid-attempt like the attempt */
const save = (s: AttemptUi) => {
	if (!s.attemptId) return;
	// Plain copies: `s` is an immer draft, gone once the update ends
	progressApi
		.save(s.attemptId, {
			current: s.current,
			flagged: [...s.flagged],
			hints_shown: { ...s.hintsShown },
		})
		.catch(e => console.error("saving exam progress", e));
};

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
						if (id && id !== s.attemptId) {
							Object.assign(s, freshAttempt(id));
							// Back where the candidate was (the app reopened mid-attempt)
							progressApi.load(id).then(saved =>
								set(t => {
									if (t.attemptId !== id) return;
									t.current = saved.current;
									t.flagged = saved.flagged;
									t.hintsShown = saved.hints_shown as Record<string, number>;
								})
							);
						}
					});
				const unsubscribe = await examApi.subscribe(apply);
				// What the guard put back or noted, as it happens
				const unsubscribeGuard = await examApi.onGuardNotice(message =>
					toast.warning(message, { duration: 8000 })
				);
				apply(await examApi.state());
				return () => {
					unsubscribe();
					unsubscribeGuard();
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
					} else if (!(e instanceof ApiError && e.code === "docker_unavailable")) {
						// Docker being down is shown live from its state (the
						// catalog's banner), not kept as an error that outlives it
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
					save(s);
				}),

			toggleFlag: questionId =>
				set(s => {
					s.flagged = s.flagged.includes(questionId)
						? s.flagged.filter(id => id !== questionId)
						: [...s.flagged, questionId];
					save(s);
				}),

			showHint: questionId =>
				set(s => {
					s.hintsShown[questionId] = (s.hintsShown[questionId] ?? 0) + 1;
					save(s);
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

			toggleSolution: questionId => {
				if (!get().solutions[questionId]) {
					get().loadSolution(questionId);
					return;
				}
				set(s => {
					s.solutionHidden[questionId] = !s.solutionHidden[questionId];
				});
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
