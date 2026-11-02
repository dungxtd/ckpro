// The only module that talks to Tauri. Wrappers unwrap specta `Result`s so a
// failed command throws an `ApiError` carrying the Rust `AppError` code.
import { Channel } from "@tauri-apps/api/core";
import {
	type Account_Serialize,
	type Activity_Serialize,
	type AgentSettings_Serialize,
	type AppError,
	type CheckResult,
	type CoachContext,
	type CoachEvent,
	commands,
	type Draft,
	type EnvState,
	type ExamReadiness_Serialize,
	type ExamState_Serialize,
	events,
	type GenerateRequest,
	type Mode,
	type ModelChoice,
	type PlanView_Serialize,
	type Progress,
	type Settings_Serialize,
	type SignInEvent,
	type SignInMethod,
} from "./bindings";

/** What the generated command functions resolve to. */
type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };

/** The exam desk's display settings */
export type Settings = Settings_Serialize;
/** The real exam the candidate aims at */
export type ExamTarget = NonNullable<Settings["target"]>;
/** An exam planned for a day */
export type PlanView = PlanView_Serialize;
/** How ready the candidate is for a certification */
export type ExamReadiness = ExamReadiness_Serialize;
/** How the sidebar lists the exams */
export type SidebarLayout = Settings["sidebar"];
export type { Progress };

/** The Claude login the assistant answers as */
export type Account = Account_Serialize;
export type { SignInMethod };
/** The assistant's agent settings */
export type AgentSettings = AgentSettings_Serialize;

/** A long operation as the app sends it */
export type Activity = Activity_Serialize;

/** Exam state as the app sends it */
export type ExamState = ExamState_Serialize;
export type Attempt = Extract<ExamState, { phase: "running" }>["attempt"];
export type ExamResult = Extract<ExamState, { phase: "finished" }>["result"];
export type QuestionView = Attempt["questions"][number];

export type {
	AgentPermission,
	AppError,
	AppInfo,
	CheckResult,
	ClusterState,
	CoachContext,
	CoachEvent,
	CoachMessage,
	CoachModels,
	CoachSession,
	CoachStatus,
	CoachTranscript,
	ContextUsage,
	Difficulty,
	DomainStat,
	Draft,
	EnvState,
	ExamSort,
	ExamSummary,
	Generated,
	GenerateRequest,
	GeneratorTarget,
	HistoryEntry,
	Issue,
	Mode,
	ModelOption,
	NodeState,
	PermissionOption,
	Profile,
	Provider,
	RuntimeInfo,
	Solution,
	StudyStats,
	Theme,
} from "./bindings";

export class ApiError extends Error {
	readonly code: AppError["code"];
	constructor(error: AppError) {
		super(error.message);
		this.code = error.code;
	}
}

/** What went wrong, for the candidate: an app error's message, else the error */
export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

async function unwrap<T>(call: Promise<Result<T, AppError>>): Promise<T> {
	const result = await call;
	if (result.status === "error") throw new ApiError(result.error);
	return result.data;
}

/** A channel that hands every message to `onMessage`. */
function channel<T>(onMessage: (message: T) => void): Channel<T> {
	const ch = new Channel<T>();
	ch.onmessage = onMessage;
	return ch;
}

export const envApi = {
	state: () => commands.envState(),
	/** Calls `onChange` with every new environment state; returns the unsubscribe. */
	subscribe: async (onChange: (state: EnvState) => void) =>
		events.envChanged.listen(event => onChange(event.payload)),
	/** Try Docker again now, not at the next backoff */
	retry: () => commands.envRetry(),
	/** Follow node readiness while it is shown (opens the clusters' node watches) */
	watchNodes: (on: boolean) => commands.envWatchNodes(on),
};

export const clusterApi = {
	/** Delete a cluster; its progress is an activity */
	delete: (name: string) => unwrap(commands.deleteCluster(name)),
	/** Start a cluster's stopped nodes */
	repair: (name: string) => unwrap(commands.repairCluster(name)),
};

export const activityApi = {
	/** The last long operations, with their logs. */
	list: () => commands.activities() as Promise<Activity[]>,
	/** An activity started or moved on (its `log` is empty here). */
	onChanged: async (on: (activity: Activity) => void) =>
		events.activityChanged.listen(event => on(event.payload as Activity)),
	onLog: async (on: (id: number, line: string) => void) =>
		events.activityLog.listen(event => on(event.payload.id, event.payload.line)),
};

export const progressApi = {
	/** Where the candidate is in an attempt (kept in the app database) */
	load: (attemptId: string) => unwrap(commands.examProgress(attemptId)),
	save: (attemptId: string, progress: Progress) =>
		unwrap(commands.saveExamProgress(attemptId, progress)),
};

export const settingsApi = {
	/** The exam desk's display settings (kept in the app database) */
	load: () => unwrap(commands.settings()) as Promise<Settings>,
	save: (settings: Settings) => unwrap(commands.saveSettings(settings)),
};

export const desktopApi = {
	/** VNC websocket port and password of the exam desktop; null until it runs. */
	session: () => unwrap(commands.desktopSession()),
	/** The exam's "Reset Desktop": restart it, closing its windows. */
	reset: () => unwrap(commands.desktopReset()),
	/** Open allowed documentation in the desktop's Firefox. */
	openUrl: (url: string) => unwrap(commands.desktopOpenUrl(url)),
};

export const coachApi = {
	/** Whether the assistant can run (Docker, which runs it) */
	status: () => commands.coachStatus(),
	/** Models to pick from, as the agent lists them for this login, and the default */
	models: () => unwrap(commands.coachModels()),
	/** The effort levels a model takes (empty: it has none) */
	efforts: (model: string) => unwrap(commands.coachEfforts(model)),
	/** The attempt's coach sessions (History) */
	sessions: () => unwrap(commands.coachSessions()),
	/** Name a question's session; empty: back to its first question */
	rename: (questionId: string, title: string) => unwrap(commands.coachRename(questionId, title)),
	/** Start a question's session over (New Session) */
	clear: (questionId: string) => unwrap(commands.coachClear(questionId)),
	newSession: (questionId: string) => unwrap(commands.coachNewSession(questionId)),
	openSession: (questionId: string, session: number) =>
		unwrap(commands.coachOpenSession(questionId, session)),
	/** A past attempt's sessions, to read back */
	transcripts: (attemptId: string) => unwrap(commands.coachTranscripts(attemptId)),
	coachedAttempts: () => unwrap(commands.coachedAttempts()),
	/** The question's session in the current attempt: its name and messages */
	history: (questionId: string) => unwrap(commands.coachHistory(questionId)),
	/** Ask about a question; `onEvent` gets the answer as it is written, and
	 * in Agent the commands it runs and its requests to run them. */
	ask: (
		questionId: string,
		text: string,
		checks: CheckResult[],
		solutionOpened: boolean,
		model: ModelChoice,
		context: CoachContext,
		onEvent: (event: CoachEvent) => void
	) =>
		unwrap(
			commands.coachAsk(
				questionId,
				text,
				checks,
				solutionOpened,
				model,
				context,
				channel<CoachEvent>(onEvent)
			)
		),
	/** Answer a request to run a command: an option's id, or null to cancel */
	permit: (id: number, option: string | null) => unwrap(commands.coachPermit(id, option)),
	/** Stop the answer being written */
	cancel: () => commands.coachCancel(),
	/** The Claude login it answers as */
	account: () => unwrap(commands.coachAccount()) as Promise<Account>,
	/** Run the Claude CLI's login; `onOutput` gets what it prints (the link,
	 * a prompt for the browser's code). Resolves when signed in. */
	signIn: (method: SignInMethod, onOutput: (text: string) => void) =>
		unwrap(
			commands.coachSignIn(
				method,
				channel<SignInEvent>(e => onOutput(e.text))
			)
		),
	/** Type a line into the running login (the browser's code) */
	signInInput: (line: string) => unwrap(commands.coachSignInInput(line)),
	signInCancel: () => unwrap(commands.coachSignInCancel()),
	signOut: () => unwrap(commands.coachSignOut()),
	/** The Claude CLI and Node.js this Mac has */
	runtime: () => unwrap(commands.coachRuntime()),
};

export const generatorApi = {
	/** Certifications and domains the generator writes for */
	targets: () => commands.generatorTargets(),
	/** Write a question, prove it on a cluster, keep it in "My questions"
	 * (progress as an activity). Each draft that lints comes to `onDraft`
	 * and waits for `review` before its scripts run */
	generate: (request: GenerateRequest, onDraft: (draft: Draft) => void) =>
		unwrap(commands.generateQuestion(request, channel(onDraft))),
	review: (approve: boolean) => unwrap(commands.generateReview(approve)),
};

export const agentApi = {
	/** How far the assistant's agent may go on its own (Settings > Assistant) */
	settings: () => unwrap(commands.agentSettings()) as Promise<AgentSettings>,
	save: (settings: AgentSettings) =>
		unwrap(commands.saveAgentSettings(settings)) as Promise<AgentSettings>,
};

export const appApi = {
	/** Where the app keeps its data, and its version */
	info: () => commands.appInfo(),
};

/** Web pages outside the exam desktop open in the system browser */
export const browserApi = {
	open: (url: string) => unwrap(commands.openInBrowser(url)),
};

export const examApi = {
	list: () => commands.listExams(),
	state: () => commands.examState() as Promise<ExamState>,
	/** Calls `onChange` with every new exam state; returns the unsubscribe. */
	subscribe: async (onChange: (state: ExamState) => void) =>
		events.examChanged.listen(event => onChange(event.payload as ExamState)),
	/** Something changed the attempt's environment outside cktry (the guard) */
	onGuardNotice: async (onNotice: (message: string) => void) =>
		events.guardNotice.listen(event => onNotice(event.payload)),
	start: (id: string, mode: Mode, replace: boolean) =>
		unwrap(commands.startExam(id, mode, replace)),
	submit: () => unwrap(commands.submitExam()),
	retry: () => unwrap(commands.retryExam()),
	end: () => unwrap(commands.endExam()),
	check: (questionId: string) => unwrap(commands.checkQuestion(questionId)),
	solution: (questionId: string) => unwrap(commands.questionSolution(questionId)),
	history: () => commands.examHistory(),
	/** Plans from `from` to `to` (YYYY-MM-DD), attempts placed on the candidate's own days */
	plans: (from: string, to: string) =>
		unwrap(commands.plansBetween(from, to, -new Date().getTimezoneOffset())),
	planAdd: (day: string, examId: string, mode: Mode) => unwrap(commands.planAdd(day, examId, mode)),
	planUpdate: (id: number, change: { day?: string; mode?: Mode }) =>
		unwrap(commands.planUpdate(id, change.day ?? null, change.mode ?? null)),
	planRemove: (id: number) => unwrap(commands.planRemove(id)),
	/** Per domain, and the predicted score, for a certification */
	readiness: (certification: string) => unwrap(commands.readiness(certification)),
	/** Delete one of the candidate's own exams (generated questions) */
	delete: (id: string) => unwrap(commands.deleteExam(id)),
	/** Results per curriculum domain, per certification attempted */
	studyStats: () => commands.studyStats(),
};

export const telemetryApi = {
	/** Send the core's errors as this person and session, or stop */
	configure: (
		on: boolean,
		key: string,
		host: string,
		distinctId = "",
		sessionId: string | null = null
	) => commands.telemetryConfigure(on, key, host, distinctId, sessionId),
};
