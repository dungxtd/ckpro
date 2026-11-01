import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { clusterApi, type EnvState, envApi, errorText } from "@/tauri/api";

type ClusterAction = "delete" | "repair";

interface EnvironmentState {
	/** Mirror of the Rust EnvState; null until the first snapshot arrives */
	env: EnvState | null;
	/** The cluster being repaired or deleted (one at a time) */
	job: { cluster: string; action: ClusterAction } | null;
	/** Why the last one failed */
	error: string | null;
}

interface EnvironmentActions {
	/** Load the current state and follow every change. Returns the unsubscribe. */
	connect: () => Promise<() => void>;
	runJob: (action: ClusterAction, cluster: string) => Promise<void>;
}

export const useEnvironment = create<EnvironmentState & EnvironmentActions>()(
	devtools(
		immer((set, get) => ({
			env: null,
			job: null,
			error: null,

			connect: async () => {
				const apply = (env: EnvState) =>
					set(s => {
						s.env = env;
					});
				const unsubscribe = await envApi.subscribe(apply);
				apply(await envApi.state());
				return unsubscribe;
			},

			runJob: async (action, cluster) => {
				if (get().job) return;
				set(s => {
					s.job = { cluster, action };
					s.error = null;
				});
				try {
					// Progress and log show as an activity
					if (action === "delete") await clusterApi.delete(cluster);
					else await clusterApi.repair(cluster);
				} catch (e) {
					set(s => {
						s.error = errorText(e);
					});
				} finally {
					set(s => {
						s.job = null;
					});
				}
			},
		})),
		{ name: "ckdry-environment", enabled: import.meta.env.DEV }
	)
);
