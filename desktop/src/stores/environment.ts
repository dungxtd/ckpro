import { toast } from "sonner";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { clusterApi, type EnvState, envApi, errorText } from "@/tauri/api";

type ClusterAction = "delete" | "repair";

interface EnvironmentState {
	/** Mirror of the Rust EnvState; null until the first snapshot arrives.
	 * What runs on a cluster is its `cluster_jobs`, kept by Rust */
	env: EnvState | null;
	/** Clusters asked to be repaired or deleted, until Rust answers: a second
	 * click then would only be refused (Rust shows the job once it begins) */
	asked: Record<string, ClusterAction>;
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
			asked: {},

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
				if (get().asked[cluster]) return;
				set(s => {
					s.asked[cluster] = action;
				});
				try {
					// Progress and log show as an activity; Rust marks the
					// cluster busy meanwhile (`cluster_jobs`)
					if (action === "delete") await clusterApi.delete(cluster);
					else await clusterApi.repair(cluster);
				} catch (e) {
					// Said where it was asked, not kept on the page after
					toast.error(errorText(e));
				} finally {
					set(s => {
						delete s.asked[cluster];
					});
				}
			},
		})),
		{ name: "ckpro-environment", enabled: import.meta.env.DEV }
	)
);
