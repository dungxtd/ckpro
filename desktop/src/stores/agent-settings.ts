import { toast } from "sonner";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { type AgentSettings, agentApi, errorText, type Provider } from "@/tauri/api";

interface AgentSettingsStore {
	/** As Rust keeps them; none until read */
	settings: AgentSettings | null;
	/** Why they could not be read: said in place, with a way to read them again */
	error: string | null;
	/** Read them (again); none if they could not be */
	read: () => Promise<AgentSettings | null>;
	/** `patch` kept: shown at once, put back (and said) if Rust refuses it;
	 * whether it was kept */
	save: (patch: Partial<AgentSettings>) => Promise<boolean>;
}

/**
 * The agents' settings (Settings > Assistant), one copy for the whole app:
 * Settings changes them, the assistant pane and its composer follow them
 */
export const useAgentSettings = create<AgentSettingsStore>()((set, get) => ({
	settings: null,
	error: null,
	read: () => {
		set({ error: null });
		return agentApi.settings().then(
			settings => {
				set({ settings });
				return settings;
			},
			e => {
				set({ error: errorText(e) });
				return null;
			}
		);
	},
	save: patch => {
		const before = get().settings;
		if (!before) return Promise.resolve(false);
		const next = { ...before, ...patch };
		set({ settings: next });
		return agentApi.save(next).then(
			saved => {
				set({ settings: saved });
				return true;
			},
			e => {
				// Not kept: the switch or field shows what is kept
				set({ settings: before });
				toast.error(errorText(e));
				return false;
			}
		);
	},
}));

/** Before they are read: Claude Code on, everything shared (Rust's defaults) */
const ENABLED_BEFORE: Provider[] = ["claude"];

/** The agents turned on in Settings (offered once signed in) */
export const useEnabledAgents = () => useAgentSettings(s => s.settings?.enabled ?? ENABLED_BEFORE);

/** What the candidate lets go to the agent at all (Settings > Assistant > Privacy) */
export const useShared = () =>
	useAgentSettings(
		useShallow(s => ({
			checks: s.settings?.share_checks ?? true,
			cluster: s.settings?.share_cluster ?? true,
		}))
	);
