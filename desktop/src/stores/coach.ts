import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
	type Account,
	ApiError,
	type CheckResult,
	type CoachContext,
	type CoachMessage,
	type CoachThread,
	type ContextUsage,
	coachApi,
	type ModelOption,
} from "@/tauri/api";
import { useExam } from "./exam";
import { useSettings } from "./settings";

/** The assistant (an ACP agent, read-only): one conversation per question of
 * the attempt, kept in the app database by Rust */
interface CoachStore {
	/** Conversations of the current attempt, by question */
	threads: Record<string, CoachMessage[]>;
	attemptId: string | null;
	/** The question whose answer is being written */
	writing: string | null;
	/** The last question failed */
	error: string | null;
	/** Models the agent offers on this login, and the one in use */
	models: ModelOption[];
	model: string;
	/** The effort levels the model takes (empty: none), and the one in use */
	efforts: ModelOption[];
	effort: string;
	setEffort: (effort: string) => void;
	/** What goes with a question besides the task (the context chips) */
	context: CoachContext;
	/** How much of the model's context each conversation uses */
	usage: Record<string, ContextUsage>;
	/** The Claude login, once read; null until then */
	account: Account | null;
	/** Read the login again (after signing in or out) */
	loadAccount: () => Promise<void>;
	/** Show or hide the assistant pane (kept in the settings) */
	setOpen: (open: boolean) => void;
	setModel: (model: string) => void;
	setContext: (patch: Partial<CoachContext>) => void;
	load: (questionId: string) => Promise<void>;
	/** `checks`: the ones to explain (the result's in review), else the last "Check my work" */
	ask: (questionId: string, text: string, checks?: CheckResult[]) => Promise<void>;
	/** New Thread: the question's conversation starts over */
	clear: (questionId: string) => Promise<void>;
	stop: () => void;
	listThreads: () => Promise<CoachThread[]>;
}

/** Another attempt: its own conversations */
const forAttempt = (s: CoachStore) => {
	const attemptId = useExam.getState().attemptId;
	if (s.attemptId !== attemptId) {
		s.attemptId = attemptId;
		s.threads = {};
		s.usage = {};
		s.error = null;
	}
};

/** The agent's models; the default unless the one picked is still offered */
const loadModels = (
	set: (patch: Partial<CoachStore>) => void,
	get: () => CoachStore,
	again = false
) =>
	coachApi
		.models()
		.then(({ options, default: fallback }) => {
			// The model last picked, kept between runs, while this login offers it
			const picked = again ? get().model : useSettings.getState().settings.assistant_model;
			const keep = !!picked && options.some(m => m.value === picked);
			set({ models: options, model: keep && picked ? picked : fallback });
			loadEfforts(set, get);
		})
		.catch(() => {});

/** The model's effort levels; the effort picked stays if the model takes it */
const loadEfforts = (set: (patch: Partial<CoachStore>) => void, get: () => CoachStore) => {
	const model = get().model;
	coachApi
		.efforts(model)
		.then(efforts => {
			if (get().model !== model) return;
			const picked = useSettings.getState().settings.assistant_effort ?? get().effort;
			const keep = efforts.some(e => e.value === picked);
			set({ efforts, effort: keep ? picked : "default" });
		})
		.catch(() => set({ efforts: [] }));
};

const message = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

export const useCoach = create<CoachStore>()(
	immer((set, get) => ({
		threads: {},
		attemptId: null,
		writing: null,
		error: null,
		models: [],
		model: "sonnet",
		context: { checks: true, cluster: true },
		usage: {},
		account: null,
		loadAccount: async () => {
			try {
				set({ account: await coachApi.account() });
				// Another login, maybe another plan: its own models
				if (get().account?.signed_in) loadModels(set, get, true);
			} catch (e) {
				set({ error: message(e) });
			}
		},
		setOpen: open => useSettings.getState().update({ assistant_open: open }),
		efforts: [],
		effort: "default",
		setModel: model => {
			set({ model });
			useSettings.getState().update({ assistant_model: model });
			loadEfforts(set, get);
		},
		setEffort: effort => {
			set({ effort });
			useSettings.getState().update({ assistant_effort: effort });
		},
		setContext: patch =>
			set(s => {
				Object.assign(s.context, patch);
			}),
		load: async questionId => {
			set(forAttempt);
			if (get().models.length === 0) loadModels(set, get);
			if (get().threads[questionId]) return;
			try {
				const messages = await coachApi.history(questionId);
				set(s => {
					s.threads[questionId] ??= messages;
				});
			} catch (e) {
				set({ error: message(e) });
			}
		},
		ask: async (questionId, text, given) => {
			set(forAttempt);
			if (get().writing) coachApi.cancel();
			if (!useSettings.getState().settings.assistant_open)
				useSettings.getState().update({ assistant_open: true });
			const { checks, solutions } = useExam.getState();
			const checked = checks[questionId];
			set(s => {
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
					const last = s.threads[questionId]?.at(-1);
					if (last?.role === "assistant") last.text += t;
				});
			try {
				const { model, effort, context } = get();
				const reply = await coachApi.ask(
					questionId,
					text,
					given ?? (Array.isArray(checked) ? checked : []),
					questionId in solutions,
					{ model, effort },
					context,
					append
				);
				set(s => {
					const last = s.threads[questionId]?.at(-1);
					if (last?.role === "assistant") last.text = reply.text;
					if (reply.usage) s.usage[questionId] = reply.usage;
				});
			} catch (e) {
				const stopped = e instanceof ApiError && e.code === "cancelled";
				set(s => {
					// A stopped or failed answer is not kept (Rust keeps only complete ones)
					const thread = s.threads[questionId];
					if (thread?.at(-1)?.role === "assistant") thread.splice(-2, 2);
					if (!stopped) s.error = message(e);
					// The login is gone or expired: offer to sign in
					if (e instanceof ApiError && e.code === "sign_in_required")
						s.account = { signed_in: false, method: null, email: null, plan: null };
				});
			} finally {
				set(s => {
					if (s.writing === questionId) s.writing = null;
				});
			}
		},
		clear: async questionId => {
			try {
				await coachApi.clear(questionId);
				set(s => {
					s.threads[questionId] = [];
					delete s.usage[questionId];
					s.error = null;
				});
			} catch (e) {
				set({ error: message(e) });
			}
		},
		stop: () => {
			coachApi.cancel();
		},
		listThreads: () => coachApi.threads().catch(() => []),
	}))
);
