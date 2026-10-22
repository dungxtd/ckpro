import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { ApiError, clusterApi, dockerApi } from "@/tauri/api";

type Docker =
	| { state: "checking" }
	| { state: "ok"; engine: string }
	| { state: "down"; reason: string };
type ClusterJob = { action: "create" | "delete"; startedAt: number } | null;

interface EnvironmentState {
	docker: Docker;
	clusterName: string;
	workers: number;
	job: ClusterJob;
	log: string[];
	lastResult: { ok: boolean; message: string } | null;
}

interface EnvironmentActions {
	refreshDocker: () => Promise<void>;
	setCluster: (patch: Partial<Pick<EnvironmentState, "clusterName" | "workers">>) => void;
	runClusterJob: (action: "create" | "delete") => Promise<void>;
}

const MAX_LOG = 500;

export const useEnvironment = create<EnvironmentState & EnvironmentActions>()(
	devtools(
		immer((set, get) => ({
			docker: { state: "checking" },
			clusterName: "k8s",
			workers: 1,
			job: null,
			log: [],
			lastResult: null,

			refreshDocker: async () => {
				try {
					const engine = await dockerApi.status();
					set(s => {
						s.docker = { state: "ok", engine };
					});
				} catch (e) {
					set(s => {
						s.docker = { state: "down", reason: e instanceof Error ? e.message : String(e) };
					});
				}
			},

			setCluster: patch =>
				set(s => {
					Object.assign(s, patch);
				}),

			runClusterJob: async action => {
				const { clusterName, workers, job } = get();
				if (job) return;
				const startedAt = Date.now();
				set(s => {
					s.job = { action, startedAt };
					s.log = [];
					s.lastResult = null;
				});
				const onLog = (line: string) =>
					set(s => {
						s.log.push(line);
						if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
					});
				try {
					if (action === "create") await clusterApi.create(clusterName, workers, onLog);
					else await clusterApi.delete(clusterName, onLog);
					const secs = Math.round((Date.now() - startedAt) / 1000);
					set(s => {
						s.lastResult = {
							ok: true,
							message: `${action === "create" ? "Created" : "Deleted"} in ${secs}s`,
						};
					});
				} catch (e) {
					const message = e instanceof ApiError ? `${e.code}: ${e.message}` : String(e);
					set(s => {
						s.lastResult = { ok: false, message };
					});
				} finally {
					set(s => {
						s.job = null;
					});
				}
			},
		})),
		{ name: "ckiu-environment", enabled: import.meta.env.DEV }
	)
);
