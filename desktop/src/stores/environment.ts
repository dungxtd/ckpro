import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { ApiError, type Check, clusterApi, type EnvState, envApi } from "@/tauri/api";

type ClusterAction = "create" | "delete" | "repair" | "adopt";

interface EnvironmentState {
	/** Mirror of the Rust EnvState; null until the first snapshot arrives */
	env: EnvState | null;
	form: { name: string; workers: number };
	preflight: Check[];
	job: { cluster: string; action: ClusterAction; startedAt: number } | null;
	log: string[];
	lastResult: { ok: boolean; message: string } | null;
}

interface EnvironmentActions {
	/** Load the current state and follow every change. Returns the unsubscribe. */
	connect: () => Promise<() => void>;
	setForm: (patch: Partial<EnvironmentState["form"]>) => void;
	refreshPreflight: () => Promise<void>;
	runJob: (action: ClusterAction, cluster?: string) => Promise<void>;
	cancelJob: () => Promise<void>;
}

const MAX_LOG = 500;

export const useEnvironment = create<EnvironmentState & EnvironmentActions>()(
	devtools(
		immer((set, get) => ({
			env: null,
			form: { name: "k8s", workers: 1 },
			preflight: [],
			job: null,
			log: [],
			lastResult: null,

			connect: async () => {
				const apply = (env: EnvState) =>
					set(s => {
						s.env = env;
					});
				const unsubscribe = await envApi.subscribe(apply);
				apply(await envApi.state());
				return unsubscribe;
			},

			setForm: patch =>
				set(s => {
					Object.assign(s.form, patch);
				}),

			refreshPreflight: async () => {
				const { name, workers } = get().form;
				const checks = await envApi.preflight(name, workers);
				set(s => {
					s.preflight = checks;
				});
			},

			runJob: async (action, cluster) => {
				if (get().job) return;
				const { name, workers } = get().form;
				const target = cluster ?? name;
				const startedAt = Date.now();
				set(s => {
					s.job = { cluster: target, action, startedAt };
					s.log = [];
					s.lastResult = null;
				});
				const onLog = (line: string) =>
					set(s => {
						s.log.push(line);
						if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
					});
				try {
					if (action === "create") await clusterApi.create(target, workers, onLog);
					else if (action === "delete") await clusterApi.delete(target, onLog);
					else if (action === "adopt") await clusterApi.adopt(target);
					else await clusterApi.repair(target);
					const secs = Math.round((Date.now() - startedAt) / 1000);
					set(s => {
						s.lastResult = { ok: true, message: `${target}: ${action} done in ${secs}s` };
					});
				} catch (e) {
					const message = e instanceof ApiError ? e.message : String(e);
					set(s => {
						s.lastResult = { ok: false, message };
					});
				} finally {
					set(s => {
						s.job = null;
					});
				}
			},

			cancelJob: async () => {
				const job = get().job;
				if (job) await clusterApi.cancel(job.cluster);
			},
		})),
		{ name: "ckdry-environment", enabled: import.meta.env.DEV }
	)
);
