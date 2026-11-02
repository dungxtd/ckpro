import { create } from "zustand";
import { track } from "@/analytics";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import {
	type ExamDraft,
	errorText,
	type StudioSessionRow,
	studioApi,
	type WorkspaceState,
} from "@/tauri/api";

export interface StudioMessage {
	role: "user" | "assistant";
	text: string;
}

/**
 * Create with Claude: the conversation shown, its draft exam, the others to
 * reopen, and the verify cluster the screen keeps ready. Rust owns all of
 * it; this mirrors it (the draft's changes and the cluster's arrive as events)
 */
interface StudioStore {
	workspace: WorkspaceState;
	sessions: StudioSessionRow[];
	session: number | null;
	messages: StudioMessage[];
	draft: ExamDraft | null;
	/** An answer is being written */
	writing: boolean;
	/** The tool Claude is using now */
	tool: string | null;
	/** The conversation whose exam is being proven (another can go on meanwhile) */
	verifying: number | null;
	error: string | null;
	/** The screen opened: the cluster is made, the latest conversation shown;
	 * returns how to stop following the cluster and the draft */
	enter: () => Promise<() => void>;
	/** The screen was left: the cluster goes after a while */
	leave: () => void;
	prepare: () => void;
	release: () => void;
	newSession: () => Promise<void>;
	open: (session: number) => Promise<void>;
	rename: (title: string) => Promise<void>;
	remove: (session: number) => Promise<void>;
	send: (text: string) => Promise<void>;
	stop: () => void;
	removeItem: (id: string) => Promise<void>;
	/** Prove the exam on a cluster, every question together (the candidate's
	 * go), then save it if they all proved */
	proveAndSave: () => Promise<void>;
	/** Save the draft as an exam; its id */
	save: () => Promise<string | null>;
	/** The candidate's changes: a title, a length, or every question out */
	edit: (change: { title?: string; duration?: number; clear?: boolean }) => Promise<void>;
	/** The title is being edited (the summary's field, or the menu's Rename) */
	renaming: boolean;
	setRenaming: (renaming: boolean) => void;
}

export const useStudio = create<StudioStore>()((set, get) => {
	const failed = (e: unknown) => set({ error: errorText(e) });
	const show = async (session: number) => {
		const c = await studioApi.open(session);
		set({ session: c.id, messages: c.messages, draft: c.draft, error: null, tool: null });
	};
	return {
		workspace: { state: "off" },
		sessions: [],
		session: null,
		messages: [],
		draft: null,
		writing: false,
		tool: null,
		verifying: null,
		error: null,
		renaming: false,
		setRenaming: renaming => set({ renaming }),

		enter: async () => {
			const stops = [
				studioApi.onState(workspace => set({ workspace })),
				studioApi.onDraft((session, draft) => {
					if (session === get().session) set({ draft });
				}),
			];
			set({ workspace: await studioApi.state() });
			get().prepare();
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
		leave: () => studioApi.leave(),
		prepare: () => {
			studioApi.prepare().catch(failed);
		},
		release: () => studioApi.release(),

		newSession: async () => {
			try {
				const c = await studioApi.create();
				set({ session: c.id, messages: [], draft: c.draft, error: null });
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
			const { session, writing } = get();
			if (session === null || writing || !text.trim()) return;
			const coach = useCoach.getState();
			set(s => ({
				writing: true,
				error: null,
				messages: [...s.messages, { role: "user", text }, { role: "assistant", text: "" }],
			}));
			const append = (piece: string) =>
				set(s => {
					const messages = [...s.messages];
					const last = messages[messages.length - 1];
					messages[messages.length - 1] = { ...last, text: last.text + piece };
					return { messages };
				});
			try {
				const reply = await studioApi.ask(
					session,
					text,
					{ model: coach.model, effort: coach.effort, profile: "agent" },
					event => {
						if (event.kind === "text") append(event.text);
						if (event.kind === "tool")
							set({
								tool:
									event.status === "completed" || event.status === "failed" ? null : event.command,
							});
					}
				);
				set(s => {
					const messages = [...s.messages];
					messages[messages.length - 1] = { role: "assistant", text: reply.text };
					return { messages };
				});
				set({ sessions: await studioApi.sessions() });
				track("studio_message");
			} catch (e) {
				// What was asked comes back to the composer's history, the pair goes
				set(s => ({ messages: s.messages.slice(0, -2) }));
				if ((e as { code?: string }).code !== "cancelled") failed(e);
				if ((e as { code?: string }).code === "sign_in_required") useCoach.getState().loadAccount();
			} finally {
				set({ writing: false, tool: null });
			}
		},
		stop: () => useCoach.getState().stop(),

		removeItem: async id => {
			const { session } = get();
			if (session === null) return;
			try {
				set({ draft: await studioApi.removeItem(session, id) });
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
			} catch (e) {
				failed(e);
			}
		},
		proveAndSave: async () => {
			const { session, verifying } = get();
			if (session === null || verifying !== null) return;
			set({ verifying: session, error: null });
			try {
				const draft = await studioApi.verify(session);
				track("studio_verified");
				// The candidate may have opened another conversation meanwhile
				if (get().session !== session) return;
				set({ draft });
				const proven = draft.items.every(i => i.status.state === "proven");
				if (proven) await get().save();
			} catch (e) {
				if (get().session === session) failed(e);
			} finally {
				set({ verifying: null });
			}
		},
		save: async () => {
			const { session } = get();
			if (session === null) return null;
			try {
				const id = await studioApi.save(session);
				await show(session);
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
