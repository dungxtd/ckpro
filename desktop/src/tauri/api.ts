// The only module that talks to Tauri. Wrappers unwrap specta `Result`s so a
// failed command throws an `ApiError` carrying the Rust `AppError` code.
import { Channel } from "@tauri-apps/api/core";
import {
	type Activity_Serialize,
	type AppError,
	type CheckResult,
	type CoachEvent,
	commands,
	type EnvState,
	type ExamState_Serialize,
	events,
	type Mode,
	type Progress,
	type Settings_Serialize,
	type TerminalEvent,
} from "./bindings";

/** What the generated command functions resolve to. */
type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };

/** The exam desk's display settings */
export type Settings = Settings_Serialize;
export type { Progress };

/** A long operation as the app sends it */
export type Activity = Activity_Serialize;

/** Exam state as the app sends it */
export type ExamState = ExamState_Serialize;
export type Attempt = Extract<ExamState, { phase: "running" }>["attempt"];
export type ExamResult = Extract<ExamState, { phase: "finished" }>["result"];
export type QuestionView = Attempt["questions"][number];

export type {
	AppError,
	Check,
	CheckResult,
	ClusterState,
	CoachMessage,
	CoachStatus,
	DomainStat,
	EnvState,
	ExamSummary,
	HistoryEntry,
	Issue,
	Mode,
	NodeState,
	ScriptResult,
	Solution,
	StudyStats,
	TerminalEvent,
} from "./bindings";

export class ApiError extends Error {
	readonly code: AppError["code"];
	constructor(error: AppError) {
		super(error.message);
		this.code = error.code;
	}
}

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
	preflight: (name: string, workers: number) => commands.preflight(name, workers),
};

export const clusterApi = {
	create: (name: string, workers: number, onLog: (line: string) => void) =>
		unwrap(commands.createCluster(name, workers, channel(onLog))),
	delete: (name: string, onLog: (line: string) => void) =>
		unwrap(commands.deleteCluster(name, channel(onLog))),
	cancel: (name: string) => commands.cancelCluster(name),
	repair: (name: string) => unwrap(commands.repairCluster(name)),
	adopt: (name: string) => unwrap(commands.adoptCluster(name)),
};

export const labApi = {
	/** Run a lab script on the jumphost. */
	runScript: (path: string) => unwrap(commands.runScript(path)),
};

export const terminalApi = {
	/** Shell on the jumphost (`null`) or directly on a node container. */
	open: (container: string | null, onEvent: (event: TerminalEvent) => void) =>
		unwrap(commands.terminalOpen(container, channel(onEvent))),
	write: (id: string, data: string) => unwrap(commands.terminalWrite(id, data)),
	resize: (id: string, cols: number, rows: number) =>
		unwrap(commands.terminalResize(id, cols, rows)),
	close: (id: string) => unwrap(commands.terminalClose(id)),
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
	/** Whether Claude Code (the coach's model) is installed */
	status: () => commands.coachStatus(),
	/** The question's conversation in the current attempt */
	history: (questionId: string) => unwrap(commands.coachHistory(questionId)),
	/** Ask about a question; `onText` gets the answer as it is written. */
	ask: (
		questionId: string,
		text: string,
		checks: CheckResult[],
		solutionOpened: boolean,
		onText: (text: string) => void
	) =>
		unwrap(
			commands.coachAsk(
				questionId,
				text,
				checks,
				solutionOpened,
				channel<CoachEvent>(e => onText(e.text))
			)
		),
	/** Stop the answer being written */
	cancel: () => commands.coachCancel(),
	/** Results per curriculum domain, per certification attempted */
	studyStats: () => commands.studyStats(),
	/** A study plan from the history; `onText` gets it as it is written */
	studyPlan: (certification: string, onText: (text: string) => void) =>
		unwrap(
			commands.coachStudyPlan(
				certification,
				channel<CoachEvent>(e => onText(e.text))
			)
		),
	/** The latest study plan for a certification */
	lastStudyPlan: (certification: string) => unwrap(commands.studyPlanLast(certification)),
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
	start: (id: string, mode: Mode, replace: boolean) =>
		unwrap(commands.startExam(id, mode, replace)),
	submit: () => unwrap(commands.submitExam()),
	end: () => unwrap(commands.endExam()),
	check: (questionId: string) => unwrap(commands.checkQuestion(questionId)),
	solution: (questionId: string) => unwrap(commands.questionSolution(questionId)),
	history: () => commands.examHistory(),
};
