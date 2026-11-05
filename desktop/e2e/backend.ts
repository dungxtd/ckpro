/**
 * The app's Rust side, stood in for in the browser: every command answers
 * from `replies` (a value, an error, or a value after a delay), the calls
 * are recorded, and tests send the events Rust would. The interface runs
 * as it does in the app (Vite, the real React tree), so a test checks what
 * the candidate sees and does, not how it is built.
 */
import type { Page } from "@playwright/test";
import app from "./fixtures/app.json" with { type: "json" };

/** What a command answers: its value, `{ $error }` (it fails), or
 * `{ $after, value }` (it answers later: a slow command) */
export type Reply = unknown;

/** The sample data: exams, attempts, plans, readiness, settings */
export const sample = app;

/** A Create conversation's draft, empty */
export const emptyDraft = {
	title: "",
	certification: "",
	duration_minutes: null,
	items: [],
	domains: [],
	saved: null,
};

/** What the app answers with no test asking otherwise: the sample data */
export const defaults: Record<string, Reply> = {
	settings: app.settings,
	save_settings: null,
	exam_state: { phase: "idle" },
	list_exams: app.exams,
	exam_history: app.history,
	study_stats: [],
	coached_attempts: [],
	plans_between: app.plans,
	readiness: app.readiness,
	env_state: {
		docker: { state: "up", engine: "OrbStack", version: "28", cpus: 8, memory_mb: 5939 },
		clusters: [],
		issues: [],
	},
	activities: [],
	app_info: { data_dir: "/tmp/cktry", version: "0.1.0" },
	coach_status: { ready: true, problem: null },
	coach_account: { signed_in: true },
	studio_sessions: [],
	studio_new: { id: 1, messages: [], draft: emptyDraft },
	studio_open: { id: 1, messages: [], draft: emptyDraft },
	studio_proofs: [],
	studio_plan: {
		workers: 1,
		mb: 2124,
		changed: 0,
		total: 0,
		minutes_all: 2,
		minutes_changed: 2,
		problem: null,
		missing: [],
	},
	telemetry_configure: null,
	"plugin:window|set_theme": null,
};

/** The day the tests live on: the sample data is around it */
export const TODAY = new Date("2026-11-02T10:00:00");

/** Open the app at `path` with the stand-in Rust side */
export async function launch(page: Page, path = "/", replies: Record<string, Reply> = {}) {
	await page.clock.setFixedTime(TODAY);
	await page.addInitScript(
		({ replies }) => {
			const w = window as unknown as Record<string, unknown> & {
				__replies: Record<string, unknown>;
				__calls: { cmd: string; args: unknown }[];
				__listeners: { event: string; handler: number; id: number }[];
			};
			w.__replies = replies;
			w.__calls = [];
			w.__listeners = [];
			let next = 1;
			w.__TAURI_INTERNALS__ = {
				transformCallback: (cb: unknown) => {
					const id = next++;
					w[`_${id}`] = cb;
					return id;
				},
				invoke: async (cmd: string, args: Record<string, unknown>) => {
					if (cmd === "plugin:event|listen") {
						const id = next++;
						w.__listeners.push({
							event: args.event as string,
							handler: args.handler as number,
							id,
						});
						return id;
					}
					if (cmd === "plugin:event|unlisten") {
						w.__listeners = w.__listeners.filter(l => l.id !== args.eventId);
						return null;
					}
					w.__calls.push({ cmd, args });
					const reply = w.__replies[cmd] as
						| { $error?: unknown; $after?: number; value?: unknown }
						| undefined;
					if (reply === undefined) {
						console.warn(`backend: no reply for ${cmd}`);
						return null;
					}
					if (reply && typeof reply === "object" && "$after" in reply) {
						await new Promise(r => setTimeout(r, reply.$after));
						return reply.value;
					}
					if (reply && typeof reply === "object" && "$error" in reply) throw reply.$error;
					return reply;
				},
				metadata: {
					currentWindow: { label: "main" },
					currentWebview: { label: "main", windowLabel: "main" },
				},
				convertFileSrc: (s: string) => s,
			};
			w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
		},
		{ replies: { ...defaults, ...replies } }
	);
	await page.goto(`/#${path}`);
}

/** Change what a command answers from now on */
export async function reply(page: Page, cmd: string, value: Reply) {
	await page.evaluate(
		([cmd, value]) => {
			(window as unknown as { __replies: Record<string, unknown> }).__replies[cmd as string] =
				value;
		},
		[cmd, value] as const
	);
}

/** Send an event as Rust would */
export async function emit(page: Page, event: string, payload: unknown) {
	await page.evaluate(
		([event, payload]) => {
			const w = window as unknown as Record<string, unknown> & {
				__listeners: { event: string; handler: number; id: number }[];
			};
			for (const l of w.__listeners.filter(l => l.event === event)) {
				(w[`_${l.handler}`] as (e: unknown) => void)({ event, id: l.id, payload });
			}
		},
		[event, payload] as const
	);
}

/** The calls made of a command, their arguments */
export async function calls(page: Page, cmd: string) {
	return page.evaluate(
		cmd =>
			(window as unknown as { __calls: { cmd: string; args: unknown }[] }).__calls
				.filter(c => c.cmd === cmd)
				.map(c => c.args),
		cmd
	);
}
