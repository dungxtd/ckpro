import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { track } from "@/analytics";
import {
	type Account,
	ApiError,
	agentApi,
	type CoachContext,
	type CoachEvent,
	type CoachMessage,
	type CoachSession,
	type ContextUsage,
	coachApi,
	errorText,
	type ModelOption,
	type PermissionOption,
	type Profile,
	type Provider,
	type RuntimeInfo,
} from "@/tauri/api";
import { useExam } from "./exam";
import { useSettings } from "./settings";

/** The assistant (an ACP agent, read-only): one conversation per question of
 * the attempt, kept in the app database by Rust */
interface CoachStore {
	/** Coach sessions of the current attempt, by question: their messages */
	sessions: Record<string, CoachMessage[]>;
	/** Their own names, where the candidate renamed them */
	titles: Record<string, string | null>;
	/** Which of each question's sessions is shown */
	shown: Record<string, number>;
	attemptId: string | null;
	/** The question whose answer is being written */
	writing: string | null;
	/** The last question failed */
	error: string | null;
	/** Models the agent offers on this login, and the one in use */
	models: ModelOption[];
	model: string;
	/** Ask (it reads and answers) or Agent (it may also run commands on the
	 * task's host, each approved); practice only. Starts as Settings say */
	profile: Profile;
	setProfile: (profile: Profile) => void;
	/** The command the agent runs now, while it runs */
	running: { questionId: string; command: string } | null;
	/** A request to run a command, waiting for the candidate */
	permission: {
		questionId: string;
		id: number;
		command: string;
		options: PermissionOption[];
	} | null;
	/** Answer it: an option's id, or null to cancel */
	permit: (option: string | null) => Promise<void>;
	/** The effort levels the model takes (empty: none), and the one in use */
	efforts: ModelOption[];
	effort: string;
	setEffort: (effort: string) => void;
	/** The agents turned on in Settings > AI (offered once signed in) */
	enabledAgents: Provider[];
	/** What the candidate lets go to Claude at all (Settings > AI > Privacy) */
	shared: { checks: boolean; cluster: boolean };
	/** What goes with a question besides the task (the context chips) */
	context: CoachContext;
	/** How much of the model's context each conversation uses */
	usage: Record<string, ContextUsage>;
	/** The Claude login, once read; null until then */
	account: Account | null;
	/** Read the login again (after signing in or out) */
	loadAccount: () => Promise<void>;
	/** What this Mac offers (the Claude CLI, Node.js), once read; null until then */
	runtime: RuntimeInfo | null;
	/** Read it again (Recheck, another CLI path); the last value stays meanwhile */
	loadRuntime: () => Promise<void>;
	/** Read the runtime, login and agent settings once, in the background, as
	 * the app opens: Settings and the pane show them at once instead of
	 * checking. Not the models: reading them starts the agent */
	warm: () => void;
	/** Read the models the agent offers, once (Settings, the pane) */
	ensureModels: () => void;
	/** Show or hide the assistant pane (kept in the settings) */
	setOpen: (open: boolean) => void;
	setModel: (model: string) => void;
	setContext: (patch: Partial<CoachContext>) => void;
	load: (questionId: string) => Promise<void>;
	/** `checks`: the ones to explain (the result's in review), else the last "Check my work" */
	/** Ask about a question; Rust knows what the candidate saw of it (its
	 * checks, its solution) */
	ask: (questionId: string, text: string) => Promise<void>;
	/** New Session: another session for the question (the earlier ones stay) */
	newSession: (questionId: string) => Promise<void>;
	/** Show one of the question's sessions (History) */
	openSession: (questionId: string, session: number) => Promise<void>;
	/** Delete Session: the one shown goes; the latest other shows */
	clear: (questionId: string) => Promise<void>;
	stop: () => void;
	listSessions: () => Promise<CoachSession[]>;
	/** Name the question's session; empty: back to its first question */
	rename: (questionId: string, title: string) => Promise<void>;
}

/** Another attempt: its own conversations */
const forAttempt = (s: CoachStore) => {
	const attemptId = useExam.getState().attemptId;
	if (s.attemptId !== attemptId) {
		s.attemptId = attemptId;
		s.sessions = {};
		s.titles = {};
		s.shown = {};
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
			set({
				models: options,
				model: keep && picked ? picked : fallback,
			});
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

/** Warmed once per app run */
let warmed = false;

export const useCoach = create<CoachStore>()(
	immer((set, get) => {
		/** Show another of the question's sessions: what Rust now shows is read again */
		const switchTo = async (questionId: string, change: () => Promise<unknown>) => {
			try {
				await change();
				set(s => {
					delete s.sessions[questionId];
					delete s.titles[questionId];
					delete s.usage[questionId];
					s.error = null;
				});
				await get().load(questionId);
			} catch (e) {
				set({ error: errorText(e) });
			}
		};
		return {
			sessions: {},
			titles: {},
			shown: {},
			attemptId: null,
			writing: null,
			error: null,
			models: [],
			model: "sonnet",
			context: { checks: true, cluster: true },
			shared: { checks: true, cluster: true },
			enabledAgents: ["claude"],
			usage: {},
			account: null,
			runtime: null,
			loadRuntime: async () => {
				try {
					set({ runtime: await coachApi.runtime() });
				} catch {
					// The last value stays
				}
			},
			warm: () => {
				if (warmed) return;
				warmed = true;
				get().loadRuntime();
				get().loadAccount();
				// A new run starts in the profile Settings name
				agentApi
					.settings()
					.then(s =>
						set({
							enabledAgents: s.enabled,
							profile: s.default_profile,
							shared: { checks: s.share_checks, cluster: s.share_cluster },
						})
					)
					.catch(() => {});
			},
			// The models come from the agent's adapter: read when the pane or the
			// agent's settings first need them, not as the app opens
			ensureModels: () => {
				get().warm();
				if (get().models.length > 0) return;
				loadModels(set, get);
			},
			loadAccount: async () => {
				try {
					const before = get().account;
					const account = await coachApi.account();
					set({ account });
					// Another login, maybe another plan: its own models
					if (
						account.signed_in &&
						before !== null &&
						before.email !== account.email &&
						get().models.length > 0
					)
						loadModels(set, get, true);
				} catch (e) {
					set({ error: errorText(e) });
				}
			},
			setOpen: open => useSettings.getState().update({ assistant_open: open }),
			efforts: [],
			effort: "default",
			profile: "ask",
			setProfile: profile => set({ profile }),
			running: null,
			permission: null,
			permit: async option => {
				const asked = get().permission;
				if (!asked) return;
				set({ permission: null });
				await coachApi.permit(asked.id, option).catch(() => {});
			},
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
				get().ensureModels();
				if (get().sessions[questionId]) return;
				try {
					const { session, title, messages } = await coachApi.history(questionId);
					set(s => {
						s.sessions[questionId] ??= messages;
						s.titles[questionId] ??= title;
						s.shown[questionId] = session;
					});
				} catch (e) {
					set({ error: errorText(e) });
				}
			},
			ask: async (questionId, text) => {
				set(forAttempt);
				if (get().writing) coachApi.cancel();
				if (!useSettings.getState().settings.assistant_open)
					useSettings.getState().update({ assistant_open: true });
				set(s => {
					s.error = null;
					s.writing = questionId;
					s.sessions[questionId] = [
						...(s.sessions[questionId] ?? []),
						{ role: "user", text },
						{ role: "assistant", text: "" },
					];
				});
				// The answer as it is written, the command running, a request to run one
				const onEvent = (e: CoachEvent) =>
					set(s => {
						if (e.kind === "text") {
							const last = s.sessions[questionId]?.at(-1);
							if (last?.role === "assistant") last.text += e.text;
						} else if (e.kind === "tool") {
							const done = e.status === "completed" || e.status === "failed";
							s.running = done ? null : { questionId, command: e.command };
						} else {
							s.permission = { questionId, id: e.id, command: e.command, options: e.options };
						}
					});
				try {
					const { model, effort, profile, context } = get();
					track("assistant_asked", {
						model,
						effort,
						profile,
						review: useExam.getState().state?.phase === "finished",
					});
					const reply = await coachApi.ask(
						questionId,
						text,
						{ model, effort, profile },
						context,
						onEvent
					);
					set(s => {
						const last = s.sessions[questionId]?.at(-1);
						if (last?.role === "assistant") last.text = reply.text;
						if (reply.usage) s.usage[questionId] = reply.usage;
						// Named from the first question, unless the candidate named it
						if (reply.title && !s.titles[questionId]) s.titles[questionId] = reply.title;
					});
				} catch (e) {
					const stopped = e instanceof ApiError && e.code === "cancelled";
					set(s => {
						// A stopped or failed answer is not kept (Rust keeps only complete ones)
						const session = s.sessions[questionId];
						if (session?.at(-1)?.role === "assistant") session.splice(-2, 2);
						if (!stopped) s.error = errorText(e);
						// The login is gone or expired: offer to sign in
						if (e instanceof ApiError && e.code === "sign_in_required")
							s.account = { signed_in: false, method: null, email: null, plan: null };
					});
				} finally {
					set(s => {
						if (s.writing === questionId) s.writing = null;
						s.running = null;
						s.permission = null;
					});
				}
			},
			newSession: questionId => switchTo(questionId, () => coachApi.newSession(questionId)),
			openSession: (questionId, session) =>
				switchTo(questionId, () => coachApi.openSession(questionId, session)),
			clear: questionId => switchTo(questionId, () => coachApi.clear(questionId)),
			stop: () => {
				coachApi.cancel();
			},
			listSessions: () => coachApi.sessions().catch(() => []),
			rename: async (questionId, title) => {
				try {
					await coachApi.rename(questionId, title);
					set(s => {
						s.titles[questionId] = title.trim() || null;
					});
				} catch (e) {
					set({ error: errorText(e) });
				}
			},
		};
	})
);
