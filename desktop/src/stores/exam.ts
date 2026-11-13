import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { track } from "@/analytics";
import {
	ApiError,
	type CheckResult,
	type ExamState,
	type ExamSummary,
	envApi,
	errorText,
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
	/** The candidate moved, flagged or opened a hint: the saved progress
	 * read as the app opened is older than that */
	touched: boolean;
}

interface ExamStore extends AttemptUi {
	/** Mirror of the Rust ExamState; null until the first snapshot arrives */
	state: ExamState | null;
	catalog: ExamSummary[];
	/** Exam waiting for confirmation to replace existing clusters */
	pendingReplace: { id: string; mode: Mode; message: string } | null;
	error: string | null;
	/** An exam being started, closed or tried again, until Rust answers: the
	 * buttons that would ask again wait (Rust refuses a second ask, with an
	 * error) */
	pending: "starting" | "ending" | "retrying" | null;
	/** The state could not be read as the app opened */
	connectError: string | null;

	connect: () => Promise<() => void>;
	loadCatalog: () => Promise<void>;
	start: (id: string, mode: Mode, replace?: boolean) => Promise<void>;
	cancelReplace: () => void;
	submit: () => Promise<void>;
	/** Whether it closed (Start Over starts the new one only then) */
	end: () => Promise<boolean>;
	/** Resume (or grade) again an attempt whose resume or grading failed */
	retry: () => Promise<void>;
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
	touched: false,
});

/** Where the candidate is, what they flagged and the hints they opened go to
 * the app database, so they survive quitting mid-attempt like the attempt */
const save = (s: AttemptUi) => {
	s.touched = true;
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

/** Where an attempt went, for analytics: graded, or failed */
function followed(before: ExamState | null, now: ExamState) {
	if (!before || before.phase === now.phase) return;
	if (now.phase === "finished")
		track("exam_finished", {
			exam_id: now.attempt.exam_id,
			mode: now.attempt.mode,
			score: Math.round(now.result.score ?? 0),
			passed: now.result.passed,
		});
	else if (now.phase === "failed")
		track("exam_failed", { during: before.phase, resumable: now.resumable });
}

const attemptId = (state: ExamState) => ("attempt" in state ? (state.attempt?.id ?? null) : null);

export const useExam = create<ExamStore>()(
	devtools(
		immer((set, get) => ({
			...freshAttempt(null),
			state: null,
			catalog: [],
			pendingReplace: null,
			error: null,
			pending: null,
			connectError: null,

			connect: async () => {
				const apply = (state: ExamState) => {
					followed(get().state, state);
					set(s => {
						// An end asked for is done once the phase moves on
						if (s.pending === "ending" && s.state?.phase !== state.phase) s.pending = null;
						s.state = state;
						const id = attemptId(state);
						if (id && id !== s.attemptId) {
							Object.assign(s, freshAttempt(id));
							// Back where the candidate was (the app reopened mid-attempt)
							progressApi
								.load(id)
								.then(saved =>
									set(t => {
										if (t.attemptId !== id || t.touched) return;
										t.current = saved.current;
										t.flagged = saved.flagged;
										t.hintsShown = saved.hints_shown as Record<string, number>;
									})
								)
								// The attempt goes on from its first question
								.catch(e => console.error("loading exam progress", e));
						}
					});
				};
				set(s => {
					s.connectError = null;
				});
				const stops: (() => void)[] = [];
				const stop = () => {
					for (const fn of stops) fn();
				};
				try {
					stops.push(await examApi.subscribe(apply));
					// What the guard put back or noted, as it happens
					stops.push(
						await examApi.onGuardNotice(message => toast.warning(message, { duration: 8000 }))
					);
					apply(await examApi.state());
				} catch (e) {
					// Without the state the app cannot open: it says so and offers a retry
					stop();
					set(s => {
						s.connectError = errorText(e);
					});
					return () => {};
				}
				return stop;
			},

			loadCatalog: async () => {
				try {
					const catalog = await examApi.list();
					set(s => {
						s.catalog = catalog;
						s.error = null;
					});
				} catch (e) {
					set(s => {
						s.error = errorText(e);
					});
				}
			},

			start: async (id, mode, replace = false) => {
				if (get().pending) return;
				set(s => {
					s.error = null;
					s.pendingReplace = null;
					s.pending = "starting";
				});
				try {
					await examApi.start(id, mode, replace);
					track("exam_started", { exam_id: id, mode });
				} catch (e) {
					// The exam needs cluster names that are in use: ask first
					if (e instanceof ApiError && e.code === "clusters_exist") {
						set(s => {
							s.pendingReplace = { id, mode, message: e.message };
						});
					} else if (e instanceof ApiError && e.code === "images_unavailable") {
						// The images could not be downloaded: build them here,
						// or wait for the connection (it tries again itself)
						toast.error(e.message, {
							duration: 12_000,
							action: { label: "Build here", onClick: () => envApi.buildImages() },
						});
					} else {
						// Said wherever it was started from (Home, the Calendar,
						// Start over), not kept on one screen
						toast.error(errorText(e));
					}
				} finally {
					set(s => {
						s.pending = null;
					});
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
					// Shown where it was asked for: the desk, the result or the failure
					toast.error(errorText(e));
				}
			},

			retry: async () => {
				if (get().pending) return;
				set(s => {
					s.pending = "retrying";
				});
				try {
					await examApi.retry();
				} catch (e) {
					// Shown where it was asked for: the desk, the result or the failure
					toast.error(errorText(e));
				} finally {
					set(s => {
						s.pending = null;
					});
				}
			},

			end: async () => {
				if (get().pending) return false;
				set(s => {
					s.pending = "ending";
				});
				const was = get().state?.phase;
				try {
					await examApi.end();
					// Cancelling a preparation only asks it to stop: still
					// "ending" until Rust says it did (the phase changes)
					if (was !== "preparing" || get().state?.phase !== was)
						set(s => {
							s.pending = null;
						});
					return true;
				} catch (e) {
					// Shown where it was asked for: the desk, the result or the failure
					toast.error(errorText(e));
					set(s => {
						s.pending = null;
					});
					return false;
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
					track("work_checked", {
						passed: results.filter(r => r.passed).length,
						checks: results.length,
					});
					set(s => {
						s.checks[questionId] = results;
					});
				} catch (e) {
					set(s => {
						delete s.checks[questionId];
					});
					toast.error(errorText(e));
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
					toast.error(errorText(e));
				}
			},
		})),
		{ name: "ckpro-exam", enabled: import.meta.env.DEV }
	)
);

/** An exam being started, closed or tried again: the buttons that would
 * start another wait */
export const useExamBusy = () => useExam(s => s.pending !== null);

/** The exams, read once if they were not yet (they stay for the life of the
 * app, read again when one is saved or deleted) */
export function useCatalog() {
	const catalog = useExam(s => s.catalog);
	const loadCatalog = useExam(s => s.loadCatalog);
	useEffect(() => {
		if (useExam.getState().catalog.length === 0) loadCatalog();
	}, [loadCatalog]);
	return catalog;
}
