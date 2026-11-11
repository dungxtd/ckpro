import { toast } from "sonner";
import { create } from "zustand";
import { track } from "@/analytics";
import { useCoach } from "@/stores/coach";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import {
	type ExamDraft,
	errorText,
	type Proof,
	type ProofPlan,
	type ProofScope,
	type StudioSessionRow,
	studioApi,
} from "@/tauri/api";

/** A tool Claude used for an answer: what it asked and what came back */
export interface StudioTool {
	id: string;
	name: string;
	/** pending, in_progress, completed, failed */
	status: string;
	/** Its arguments, as JSON */
	input: string;
	output: string | null;
	/** How long it took (ms), once done */
	ms: number | null;
	/** When it started here (ms since the epoch), while it runs */
	since?: number;
}

export interface StudioMessage {
	role: "user" | "assistant";
	text: string;
	/** An answer's tools, in the order Claude used them */
	tools: StudioTool[];
}

/** An answer being written in a conversation: what was asked, the words and
 * the tools so far */
export interface Pending {
	asked: string;
	text: string;
	tools: StudioTool[];
}

/**
 * Create with Claude: the conversation shown, its draft exam and what
 * proving it takes, the others to reopen. Rust owns all of it; this mirrors
 * it (the draft's changes and the proofs' arrive as events). Conversations
 * go on at once: each has its answer being written, its proof (on a
 * cluster made for it) and its error, whichever is shown
 */
interface StudioStore {
	/** What proving the shown exam takes, and why it cannot run now if so */
	plan: ProofPlan | null;
	sessions: StudioSessionRow[];
	session: number | null;
	/** The shown conversation's, as kept (an answer being written is in `pending`) */
	messages: StudioMessage[];
	draft: ExamDraft | null;
	/** Answers being written, by conversation */
	pending: Record<number, Pending>;
	/** Each conversation's latest proof as it last stood: running (no
	 * `ended_at`) or ended, its steps, times and log to read */
	last: Record<number, Proof>;
	/** Conversations whose proof was asked for and has not reported yet: a
	 * second ask then would only be refused, its error kept on the chat */
	asked: Record<number, true>;
	/** What went wrong, by conversation */
	errors: Record<number, string>;
	/** What was asked when the answer failed (the error is that one's), by
	 * conversation, to ask again: a failed answer is not kept */
	unsent: Record<number, string>;
	/** What the panel shows: the exam's questions, or its latest proof */
	tab: "exam" | "proof";
	setTab: (tab: "exam" | "proof") => void;
	/** The screen opened: the latest conversation shown, the drafts, the
	 * proofs and the exams followed; returns how to stop following them */
	/** Opened: follows the drafts and proofs until the returned stop;
	 * `ask` starts a new conversation with it (from a result's What next) */
	enter: (ask?: string) => () => void;
	newSession: () => Promise<void>;
	open: (session: number) => Promise<void>;
	remove: (session: number) => Promise<void>;
	send: (text: string) => Promise<void>;
	/** Stop the shown conversation's answer */
	stop: () => void;
	removeItem: (id: string) => Promise<void>;
	/** Prove the exam on a cluster made for it, every question together (the
	 * candidate's go): all, or those not proven. Then save it if they all proved */
	/** Prove the exam, and save it once every question proves (`save`) */
	proveAndSave: (scope: ProofScope, save?: boolean) => Promise<void>;
	/** Send Claude the questions that did not prove, to fix or replace */
	askToFix: () => Promise<void>;
	/** Stop proving the shown conversation's exam */
	stopProof: () => void;
	/** Save a conversation's draft (the shown one's by default) as an exam; its id */
	save: (session?: number) => Promise<string | null>;
	/** The candidate's changes: a title, a length, or every question out */
	edit: (change: { title?: string; duration?: number; clear?: boolean }) => Promise<void>;
	/** The title is being edited (the summary's field, or the menu's Rename) */
	renaming: boolean;
	setRenaming: (renaming: boolean) => void;
}

/** A conversation's proof, while it runs */
export const running = (s: Pick<StudioStore, "last">, session: number | null) => {
	const proof = session === null ? undefined : s.last[session];
	return proof && !proof.ended_at ? proof : undefined;
};

/** The Exams screen, on one exam (the router's hash) */
const openExam = (id: string) => {
	window.location.hash = `#/exams?exam=${encodeURIComponent(id)}`;
};

const without = <T>(record: Record<number, T>, key: number) => {
	const { [key]: _, ...rest } = record;
	return rest;
};

export const useStudio = create<StudioStore>()((set, get) => {
	const failed = (session: number, e: unknown, asked?: string) =>
		set(s => ({
			errors: { ...s.errors, [session]: errorText(e) },
			unsent: asked === undefined ? without(s.unsent, session) : { ...s.unsent, [session]: asked },
		}));
	const cleared = (session: number) =>
		set(s => ({ errors: without(s.errors, session), unsent: without(s.unsent, session) }));
	/** What proving the shown exam takes, again (its questions, Docker or
	 * the clusters beside changed) */
	const replan = async () => {
		const { session } = get();
		if (session === null) return;
		const plan = await studioApi.plan(session).catch(() => null);
		if (get().session === session) set({ plan });
	};
	// The conversation asked for last: a slower answer for an earlier one
	// does not take its place
	let asked = 0;
	const show = async (session: number) => {
		const ticket = ++asked;
		const c = await studioApi.open(session);
		if (ticket !== asked) return;
		set({
			session: c.id,
			messages: c.messages as StudioMessage[],
			draft: c.draft,
			plan: null,
			tab: "exam",
		});
		replan();
	};
	/** Read the shown conversation again, where it is (its messages kept,
	 * its exam deleted elsewhere) */
	const refresh = async () => {
		const { session } = get();
		if (session === null) return;
		const c = await studioApi.open(session).catch(() => null);
		if (c && get().session === session) {
			set({ messages: c.messages as StudioMessage[], draft: c.draft });
			replan();
		}
	};
	// The first conversation is shown once, however often the screen opens
	let loading: Promise<void> | null = null;
	const load = () => {
		loading ??= (async () => {
			const [sessions, proofs] = await Promise.all([studioApi.sessions(), studioApi.proofs()]);
			set(s => ({ sessions, last: { ...s.last, ...Object.fromEntries(proofs) } }));
			if (get().session !== null) return refresh();
			if (sessions[0]) await show(sessions[0].id);
			else await get().newSession();
		})().finally(() => {
			loading = null;
		});
		return loading;
	};

	return {
		plan: null,
		sessions: [],
		session: null,
		messages: [],
		draft: null,
		pending: {},
		last: {},
		asked: {},
		errors: {},
		unsent: {},
		tab: "exam",
		setTab: tab => set({ tab }),
		renaming: false,
		setRenaming: renaming => set({ renaming }),

		enter: ask => {
			// Docker and the clusters beside decide whether proving fits; the
			// exams, whether a saved one is still there
			let replanning: ReturnType<typeof setTimeout> | undefined;
			const stopEnv = useEnvironment.subscribe((s, before) => {
				if (s.env === before.env) return;
				clearTimeout(replanning);
				replanning = setTimeout(replan, 500);
			});
			const stopExams = useExam.subscribe((s, before) => {
				if (s.catalog !== before.catalog) refresh();
			});
			const stops = [
				studioApi.onDraft((session, draft) => {
					if (session !== get().session) return;
					set({ draft });
					replan();
				}),
				studioApi.onProof((session, proof) => {
					// Its end comes as its last state, then none: the last stays
					if (proof) set(s => ({ last: { ...s.last, [session]: proof } }));
				}),
			];
			load()
				.then(async () => {
					if (!ask) return;
					await get().newSession();
					await get().send(ask);
				})
				.catch(e => toast.error(errorText(e)));
			return () => {
				stopEnv();
				stopExams();
				clearTimeout(replanning);
				for (const stop of stops) stop.then(fn => fn());
			};
		},

		newSession: async () => {
			// The shown one is still empty: it is the new one
			const { session, messages, draft } = get();
			if (session !== null && messages.length === 0 && !draft?.items.length) return;
			try {
				const c = await studioApi.create();
				asked++;
				set({ session: c.id, messages: [], draft: c.draft, plan: null, tab: "exam" });
			} catch (e) {
				if (session !== null) failed(session, e);
			}
		},
		open: async session => {
			await show(session).catch(e => failed(session, e));
		},
		remove: async session => {
			try {
				await studioApi.remove(session);
				const sessions = await studioApi.sessions();
				set(s => ({
					sessions,
					pending: without(s.pending, session),
					last: without(s.last, session),
					errors: without(s.errors, session),
					unsent: without(s.unsent, session),
				}));
				if (session === get().session) {
					if (sessions[0]) await show(sessions[0].id);
					else {
						set({ session: null });
						await get().newSession();
					}
				}
			} catch (e) {
				failed(session, e);
			}
		},
		send: async text => {
			const { session, pending } = get();
			if (session === null || pending[session] || !text.trim()) return;
			const coach = useCoach.getState();
			const change = (f: (p: Pending) => Pending | null) =>
				set(s => {
					const pending = { ...s.pending };
					const next = pending[session] && f(pending[session]);
					if (next) pending[session] = next;
					else delete pending[session];
					return { pending };
				});
			cleared(session);
			set(s => ({ pending: { ...s.pending, [session]: { asked: text, text: "", tools: [] } } }));
			// Answered and kept: a failure after it (reading the lists again) is
			// not offered to be asked again
			let answered = false;
			try {
				await studioApi.ask(
					session,
					text,
					{ model: coach.model, effort: coach.effort, profile: "agent" },
					event => {
						if (event.kind === "text") change(p => ({ ...p, text: p.text + event.text }));
						if (event.kind === "tool")
							change(p => {
								const done = event.status === "completed" || event.status === "failed";
								const was = p.tools.find(t => t.id === event.id);
								const since = was?.since ?? Date.now();
								const tool: StudioTool = {
									id: event.id,
									name: event.command,
									status: event.status,
									input: event.input ?? was?.input ?? "",
									output: event.output ?? was?.output ?? null,
									ms: done ? (was?.ms ?? Date.now() - since) : null,
									since,
								};
								return {
									...p,
									tools: was
										? p.tools.map(t => (t.id === event.id ? tool : t))
										: [...p.tools, tool],
								};
							});
					}
				);
				answered = true;
				// Kept now: read again, as kept, if it is the one shown
				if (get().session === session) await refresh();
				set({ sessions: await studioApi.sessions() });
				track("studio_message");
			} catch (e) {
				const code = (e as { code?: string }).code;
				// Signed out: asking again cannot answer until the candidate signs in
				const again = !answered && code !== "sign_in_required";
				if (code !== "cancelled") failed(session, e, again ? text : undefined);
				if (code === "sign_in_required") useCoach.getState().loadAccount();
			} finally {
				change(() => null);
			}
		},
		stop: () => {
			const { session } = get();
			if (session !== null) studioApi.stop(session);
		},

		removeItem: async id => {
			const { session } = get();
			if (session === null) return;
			try {
				set({ draft: await studioApi.removeItem(session, id) });
				replan();
			} catch (e) {
				failed(session, e);
			}
		},
		edit: async change => {
			const { session } = get();
			if (session === null) return;
			try {
				set({
					draft: await studioApi.edit(
						session,
						change.title ?? null,
						change.duration ?? null,
						!!change.clear
					),
				});
				replan();
			} catch (e) {
				failed(session, e);
			}
		},
		proveAndSave: async (scope, save = true) => {
			const { session } = get();
			if (session === null || running(get(), session) || get().asked[session]) return;
			set(s => ({ asked: { ...s.asked, [session]: true } }));
			// Its steps as they go
			cleared(session);
			set({ tab: "proof" });
			try {
				const draft = await studioApi.verify(session, scope);
				track("studio_verified");
				// Done: back to the questions, where each one's result shows
				if (get().session === session) {
					set({ draft, tab: "exam" });
					replan();
				}
				if (save && draft.items.every(i => i.status.state === "proven")) await get().save(session);
			} catch (e) {
				// Stopped: its last state says so
				if ((e as { code?: string }).code !== "cancelled") failed(session, e);
			} finally {
				set(s => ({ asked: without(s.asked, session) }));
			}
		},
		askToFix: async () => {
			const { draft, send } = get();
			const broken = (draft?.items ?? []).flatMap(i =>
				i.status.state === "failed" ? [{ title: i.title, problems: i.status.problems }] : []
			);
			if (broken.length === 0) return;
			const lines = broken.map(b => `- "${b.title}": ${b.problems.slice(0, 3).join("; ")}`);
			await send(
				`Proving the exam, ${broken.length === 1 ? "this question" : "these questions"} did not prove:\n${lines.join("\n")}\nFix ${broken.length === 1 ? "it" : "them"}, or replace ${broken.length === 1 ? "it" : "them"} with another.`
			);
		},
		stopProof: () => {
			const { session } = get();
			if (session !== null) studioApi.stopProof(session);
		},
		save: async (session = get().session ?? undefined) => {
			if (session === undefined) return null;
			try {
				const id = await studioApi.save(session);
				await useExam.getState().loadCatalog();
				toast.success("Exam saved", {
					action: { label: "Open", onClick: () => openExam(id) },
				});
				if (get().session === session) await refresh();
				track("studio_saved");
				return id;
			} catch (e) {
				failed(session, e);
				return null;
			}
		},
	};
});

/** Whether the conversation shown has its exam being proven, or asked to
 * be: then nothing changes it (Rust refuses; the screen does not offer it) */
export const useProving = () =>
	useStudio(s => !!running(s, s.session) || (s.session !== null && !!s.asked[s.session]));
