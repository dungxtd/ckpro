// The only module that talks to Tauri. Wrappers unwrap specta `Result`s so a
// failed command throws an `ApiError` carrying the Rust `AppError` code.
import { Channel } from "@tauri-apps/api/core";
import {
	type AppError,
	commands,
	type EnvState,
	type ExamState_Serialize,
	events,
	type Mode,
	type TerminalEvent,
} from "./bindings";

/** What the generated command functions resolve to. */
type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };

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
	EnvState,
	ExamSummary,
	HistoryEntry,
	Issue,
	Mode,
	NodeState,
	ScriptResult,
	Solution,
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

export const desktopApi = {
	/** VNC websocket port and password of the exam desktop; null until it runs. */
	session: () => unwrap(commands.desktopSession()),
};

export const examApi = {
	list: () => commands.listExams(),
	state: () => commands.examState() as Promise<ExamState>,
	/** Calls `onChange` with every new exam state; returns the unsubscribe. */
	subscribe: async (onChange: (state: ExamState) => void) =>
		events.examChanged.listen(event => onChange(event.payload as ExamState)),
	/** Calls `onLine` with each progress line while an attempt is prepared. */
	onLog: async (onLine: (line: string) => void) =>
		events.examLog.listen(event => onLine(event.payload)),
	start: (id: string, mode: Mode, replace: boolean) =>
		unwrap(commands.startExam(id, mode, replace)),
	submit: () => unwrap(commands.submitExam()),
	end: () => unwrap(commands.endExam()),
	check: (questionId: string) => unwrap(commands.checkQuestion(questionId)),
	solution: (questionId: string) => unwrap(commands.questionSolution(questionId)),
	history: () => commands.examHistory(),
};
