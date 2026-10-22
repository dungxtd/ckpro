// The only module that talks to Tauri. Wrappers unwrap specta `Result`s so a
// failed command throws an `ApiError` carrying the Rust `AppError` code.
import { Channel } from "@tauri-apps/api/core";
import { type AppError, commands, type TerminalEvent } from "./bindings";

/** What the generated command functions resolve to. */
type Result<T, E> = { status: "ok"; data: T } | { status: "error"; error: E };

export type { AppError, ScriptResult, TerminalEvent } from "./bindings";

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

export const dockerApi = {
	status: () => unwrap(commands.dockerStatus()),
};

export const clusterApi = {
	create: (name: string, workers: number, onLog: (line: string) => void) =>
		unwrap(commands.createCluster(name, workers, channel(onLog))),
	delete: (name: string, onLog: (line: string) => void) =>
		unwrap(commands.deleteCluster(name, channel(onLog))),
};

export const labApi = {
	runScript: (cluster: string, path: string) => unwrap(commands.runScript(cluster, path)),
};

export const terminalApi = {
	open: (container: string, onEvent: (event: TerminalEvent) => void) =>
		unwrap(commands.terminalOpen(container, channel(onEvent))),
	write: (id: string, data: string) => unwrap(commands.terminalWrite(id, data)),
	resize: (id: string, cols: number, rows: number) =>
		unwrap(commands.terminalResize(id, cols, rows)),
	close: (id: string) => unwrap(commands.terminalClose(id)),
};
