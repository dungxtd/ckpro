/**
 * The app's Rust side, stood in for in the browser: every command answers
 * from `replies` (a value, an error, or a value after a delay), the calls
 * are recorded, and tests send the events Rust would. The interface runs
 * as it does in the app (Vite, the real React tree), so a test checks what
 * the candidate sees and does, not how it is built.
 */
import type { Page } from "@playwright/test";
import type {
	Account_Serialize,
	Activity_Serialize,
	AgentSettings_Serialize,
	AppInfo,
	CoachStatus_Serialize,
	DesktopSession,
	DockerState,
	EnvState_Serialize,
	ExamReadiness_Serialize,
	ExamState_Serialize,
	ExamSummary,
	HistoryEntry_Serialize,
	PlanView_Serialize,
	Progress,
	Proof_Serialize,
	ProofPlan_Serialize,
	RuntimeInfo_Serialize,
	Settings_Serialize,
	StudioConversation_Serialize,
	StudioSessionRow,
	StudyStats,
} from "../src/tauri/bindings";
import app from "./fixtures/app.json" with { type: "json" };

/** What a command answers: its value, `{ $error }` (it fails), or
 * `{ $after, value }` (it answers later: a slow command) */
export type Reply = unknown;

/** The sample data: exams, attempts, plans, readiness, settings */
export const sample = app as {
	exams: ExamSummary[];
	history: HistoryEntry_Serialize[];
	plans: PlanView_Serialize[];
	readiness: ExamReadiness_Serialize;
	settings: Settings_Serialize;
};

/** The sample settings with `patch` over them */
export const withSettings = (patch: Partial<Settings_Serialize>): Settings_Serialize => ({
	...sample.settings,
	...patch,
});

/** Docker up, as the sample machine has it */
export const dockerUp: DockerState = {
	state: "up",
	engine: "OrbStack",
	version: "28",
	cpus: 8,
	memory_mb: 5939,
};

/** A Create conversation's draft, empty */
export const emptyDraft = {
	title: "",
	certification: "",
	duration_minutes: null,
	items: [],
	domains: [],
	saved: null,
	together: false,
};

/** What the commands answer, as the bindings have it */
type Results = {
	settings: Settings_Serialize;
	save_settings: null;
	exam_state: ExamState_Serialize;
	list_exams: ExamSummary[];
	exam_history: HistoryEntry_Serialize[];
	study_stats: StudyStats[];
	coached_attempts: string[];
	plans_between: PlanView_Serialize[];
	plan_add: number;
	plan_remove: null;
	readiness: ExamReadiness_Serialize;
	env_state: EnvState_Serialize;
	env_watch_nodes: null;
	activities: Activity_Serialize[];
	app_info: AppInfo;
	coach_status: CoachStatus_Serialize;
	coach_account: Account_Serialize;
	coach_runtime: RuntimeInfo_Serialize;
	agent_settings: AgentSettings_Serialize;
	studio_sessions: StudioSessionRow[];
	studio_new: StudioConversation_Serialize;
	studio_open: StudioConversation_Serialize;
	studio_proofs: [number, Proof_Serialize][];
	studio_plan: ProofPlan_Serialize;
	studio_stop_proof: null;
	exam_progress: Progress;
	save_exam_progress: null;
	desktop_session: DesktopSession | null;
	telemetry_configure: null;
};

/** What the app answers with no test asking otherwise: the sample data */
export const defaults: Partial<Results> & Record<string, Reply> = {
	settings: sample.settings,
	save_settings: null,
	exam_state: { phase: "idle" },
	list_exams: sample.exams,
	exam_history: sample.history,
	study_stats: [],
	coached_attempts: [],
	plans_between: sample.plans,
	plan_add: 100,
	plan_remove: null,
	readiness: sample.readiness,
	env_state: {
		docker: dockerUp,
		clusters: [],
		issues: [],
		passed: [],
		usage: null,
		images_missing: [],
		images_downloading: false,
		images_checked: true,
		images_unavailable: null,
		cache_clearing: false,
		cluster_jobs: {},
		host: null,
		memory: null,
	},
	env_watch_nodes: null,
	activities: [],
	app_info: { data_dir: "/tmp/ckpro", version: "0.1.0" },
	coach_status: { ready: true, problem: null },
	coach_account: { signed_in: true, method: null, email: null, plan: null },
	coach_runtime: {
		claude: "/usr/local/bin/claude",
		claude_version: "2.0.0",
		node: "/usr/local/bin/npx",
		problem: null,
	},
	agent_settings: {
		enabled: ["claude"],
		default_profile: "ask",
		permission: "read_only",
		command_timeout: 60,
		never_run: [],
		claude_path: null,
		share_checks: true,
		share_cluster: true,
		telemetry: false,
		notes: "",
	},
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
	studio_stop_proof: null,
	exam_progress: { current: 0, flagged: [], hints_shown: {} },
	save_exam_progress: null,
	desktop_session: null,
	telemetry_configure: null,
	"plugin:window|set_theme": null,
	"plugin:window|is_maximized": false,
};

/** The day the tests live on: the sample data is around it */
export const TODAY = new Date("2026-11-02T10:00:00Z");

/** Open the app at `path` with the stand-in Rust side */
export async function launch(page: Page, path = "/", replies: Record<string, Reply> = {}) {
	await page.clock.setFixedTime(TODAY);
	await page.addInitScript(
		({ replies }) => {
			const w = window as unknown as Record<string, unknown> & {
				__replies: Record<string, unknown>;
				__calls: { cmd: string; args: unknown }[];
				__listeners: { event: string; handler: number; id: number }[];
				__plans: { seed: unknown; list: Plan[] };
			};
			type Plan = {
				id: number;
				day: string;
				exam_id: string;
				title: string;
				certification: string;
				mode: string;
				done: number | null;
			};
			w.__replies = replies;
			w.__plans = { seed: undefined, list: [] };
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
						// As Tauri does: a command it does not have fails
						console.error(`backend: no reply for ${cmd}`);
						throw `command ${cmd} not found`;
					}
					if (reply && typeof reply === "object" && "$after" in reply) {
						await new Promise(r => setTimeout(r, reply.$after));
						return reply.value;
					}
					if (reply && typeof reply === "object" && "$error" in reply) throw reply.$error;
					if (cmd === "plans_between" || cmd === "plan_add" || cmd === "plan_remove") {
						// The plans kept as the Rust side keeps them: seeded from the
						// reply to plans_between (again when a test changes it)
						const seed = w.__replies.plans_between;
						if (w.__plans.seed !== seed) {
							w.__plans = { seed, list: Array.isArray(seed) ? [...seed] : [] };
						}
						const plans = w.__plans.list;
						// A change is told as Rust tells it, once the call has answered
						const changed = () =>
							setTimeout(() => {
								for (const l of w.__listeners.filter(l => l.event === "study-changed")) {
									(w[`_${l.handler}`] as (e: unknown) => void)({
										event: "study-changed",
										id: l.id,
										payload: { catalog: false },
									});
								}
							});
						if (cmd === "plan_remove") {
							w.__plans.list = plans.filter(p => p.id !== args.id);
							changed();
							return null;
						}
						if (cmd === "plan_add") {
							const wanted = typeof reply === "number" ? reply : 1;
							const id = plans.some(p => p.id >= wanted)
								? Math.max(...plans.map(p => p.id)) + 1
								: wanted;
							const exams = (w.__replies.list_exams ?? []) as {
								id: string;
								title: string;
								certification: string;
							}[];
							const exam = exams.find(e => e.id === args.examId);
							// Refused as Rust refuses them: an exam not in the bank, or one
							// planned on that day already
							if (!exam) throw { code: "not_found", message: `no exam '${args.examId}'` };
							if (plans.some(p => p.day === args.day && p.exam_id === args.examId))
								throw { code: "invalid", message: "That exam is planned on that day already" };
							plans.push({
								id,
								day: args.day as string,
								exam_id: args.examId as string,
								title: exam?.title ?? (args.examId as string),
								certification: exam?.certification ?? "",
								mode: args.mode as string,
								done: null,
							});
							changed();
							return id;
						}
						// Plans are read by days, as the Rust side does
						return plans.filter(
							p => p.day >= (args.from as string) && p.day <= (args.to as string)
						);
					}
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
