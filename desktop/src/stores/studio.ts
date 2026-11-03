import { create } from "zustand";
import { track } from "@/analytics";
import { useCoach } from "@/stores/coach";
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

export interface StudioMessage {
	role: "user" | "assistant";
	text: string;
}

/** An answer being written in a conversation: what was asked, the words so
 * far, the tool Claude is using */
export interface Pending {
	asked: string;
	text: string;
	tool: string | null;
}

/** How a conversation's last proof ended, for its panel to say */
export type ProofEnd =
	| { kind: "stopped"; at: number; of: number }
	| { kind: "done"; ms: number; failed: number; checked: number };

/**
 * Create with Claude: the conversation shown, its draft exam and what
 * proving it takes, the others to reopen. Rust owns all of it; this mirrors
 * it (the draft's changes and the proofs' arrive as events). Conversations
 * go on at once: each has its answer being written and its exam being
 * proven (on a cluster made for it), whichever is shown
 */
interface StudioStore {
	/** What proving the shown exam takes, and why it cannot run now if so */
	plan: ProofPlan | null;
	/** How each conversation's last proof ended */
	ended: Record<number, ProofEnd>;
	sessions: StudioSessionRow[];
	session: number | null;
	/** The shown conversation's, as kept (an answer being written is in `pending`) */
	messages: StudioMessage[];
	draft: ExamDraft | null;
	/** Answers being written, by conversation */
	pending: Record<number, Pending>;
	/** Exams being proven, by conversation */
	proofs: Record<number, Proof>;
	/** Each conversation's latest proof as it last stood (running or ended):
	 * its steps, times and log stay to read */
	last: Record<number, Proof>;
	/** What the panel shows: the exam's questions, or its latest proof */
	tab: "exam" | "proof";
	setTab: (tab: "exam" | "proof") => void;
	error: string | null;
	/** The screen opened: the latest conversation shown; returns how to stop
	 * following the drafts and the proofs */
	enter: () => Promise<() => void>;
	newSession: () => Promise<void>;
	open: (session: number) => Promise<void>;
	rename: (title: string) => Promise<void>;
	remove: (session: number) => Promise<void>;
	send: (text: string) => Promise<void>;
	/** Stop the shown conversation's answer */
	stop: () => void;
	removeItem: (id: string) => Promise<void>;
	/** Prove the exam on a cluster made for it, every question together (the
	 * candidate's go): all, or those not proven. Then save it if they all proved */
	proveAndSave: (scope: ProofScope) => Promise<void>;
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

export const useStudio = create<StudioStore>()((set, get) => {
	const failed = (e: unknown) => set({ error: errorText(e) });
	/** What proving the shown exam takes, again (its questions changed) */
	const replan = async () => {
		const { session } = get();
		if (session === null) return;
		const plan = await studioApi.plan(session).catch(() => null);
		if (get().session === session) set({ plan });
	};
	const show = async (session: number) => {
		const c = await studioApi.open(session);
		set({
			session: c.id,
			messages: c.messages,
			draft: c.draft,
			error: null,
			plan: null,
			tab: "exam",
		});
		replan();
	};
	return {
		plan: null,
		ended: {},
		sessions: [],
		session: null,
		messages: [],
		draft: null,
		pending: {},
		proofs: {},
		last: {},
		tab: "exam",
		setTab: tab => set({ tab }),
		error: null,
		renaming: false,
		setRenaming: renaming => set({ renaming }),

		enter: async () => {
			const stops = [
				studioApi.onDraft((session, draft) => {
					if (session !== get().session) return;
					set({ draft });
					replan();
				}),
				studioApi.onProof((session, proof) =>
					set(s => {
						const proofs = { ...s.proofs };
						if (!proof) {
							delete proofs[session];
							return { proofs };
						}
						if (!proof.ended_at) proofs[session] = proof;
						return { proofs, last: { ...s.last, [session]: proof } };
					})
				),
			];
			const running = Object.fromEntries(await studioApi.proofs());
			set(s => ({ proofs: running, last: { ...s.last, ...running } }));
			try {
				const sessions = await studioApi.sessions();
				set({ sessions });
				const current = get().session;
				if (current === null) {
					if (sessions[0]) await show(sessions[0].id);
					else await get().newSession();
				}
			} catch (e) {
				failed(e);
			}
			return () => {
				for (const stop of stops) stop.then(fn => fn());
			};
		},

		newSession: async () => {
			try {
				const c = await studioApi.create();
				set({ session: c.id, messages: [], draft: c.draft, error: null, plan: null, tab: "exam" });
			} catch (e) {
				failed(e);
			}
		},
		open: async session => {
			try {
				await show(session);
			} catch (e) {
				failed(e);
			}
		},
		rename: async title => {
			const { session } = get();
			if (session === null) return;
			await studioApi.rename(session, title).catch(failed);
			set({ sessions: await studioApi.sessions() });
		},
		remove: async session => {
			await studioApi.remove(session).catch(failed);
			const sessions = await studioApi.sessions();
			set({ sessions });
			if (session === get().session) {
				if (sessions[0]) await show(sessions[0].id);
				else await get().newSession();
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
			set(s => ({
				error: null,
				pending: { ...s.pending, [session]: { asked: text, text: "", tool: null } },
			}));
			try {
				const reply = await studioApi.ask(
					session,
					text,
					{ model: coach.model, effort: coach.effort, profile: "agent" },
					event => {
						if (event.kind === "text") change(p => ({ ...p, text: p.text + event.text }));
						if (event.kind === "tool")
							change(p => ({
								...p,
								tool:
									event.status === "completed" || event.status === "failed" ? null : event.command,
							}));
					}
				);
				// Kept now: in the conversation, if it is the one shown
				if (get().session === session)
					set(s => ({
						messages: [
							...s.messages,
							{ role: "user", text },
							{ role: "assistant", text: reply.text },
						],
					}));
				set({ sessions: await studioApi.sessions() });
				track("studio_message");
			} catch (e) {
				const code = (e as { code?: string }).code;
				if (code !== "cancelled" && get().session === session) failed(e);
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
				failed(e);
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
				failed(e);
			}
		},
		proveAndSave: async scope => {
			const { session, proofs } = get();
			if (session === null || proofs[session]) return;
			// Its steps as they go
			set({ error: null, tab: "proof" });
			const ended = (end: ProofEnd) => set(s => ({ ended: { ...s.ended, [session]: end } }));
			const started = Date.now();
			try {
				const draft = await studioApi.verify(session, scope);
				track("studio_verified");
				const failed = draft.items.filter(i => i.status.state === "failed").length;
				const checked = get().last[session]?.checking.length ?? draft.items.length;
				ended({ kind: "done", ms: Date.now() - started, failed, checked });
				// Done: back to the questions, where each one's result shows
				if (get().session === session) {
					set({ draft, tab: "exam" });
					replan();
				}
				if (draft.items.every(i => i.status.state === "proven")) await get().save(session);
			} catch (e) {
				if ((e as { code?: string }).code === "cancelled") {
					// Where it was: the last event before it ended
					const last = get().last[session];
					if (last)
						ended({ kind: "stopped", at: last.results.length + 1, of: last.checking.length });
				} else if (get().session === session) failed(e);
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
				if (get().session === session) await show(session);
				await useExam.getState().loadCatalog();
				track("studio_saved");
				return id;
			} catch (e) {
				failed(e);
				return null;
			}
		},
	};
});
