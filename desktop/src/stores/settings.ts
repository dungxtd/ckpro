import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { type Settings, settingsApi } from "@/tauri/api";

interface SettingsStore {
	/** Mirror of what the app database keeps */
	settings: Settings;
	/** Read once at start: the desk opens as it was left, not with defaults first */
	loaded: boolean;
	load: () => Promise<void>;
	/** Change some settings; saved to the app database */
	update: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>()(
	immer((set, get) => ({
		settings: {
			desktop_zoom: 1,
			desktop_resolution: null,
			question_size: 1,
			task_width: 34,
			assistant_open: false,
			assistant_width: 380,
			assistant_model: null,
			assistant_effort: null,
			assistant_enabled: true,
		},
		loaded: false,
		load: async () => {
			const settings = await settingsApi.load().catch(e => {
				console.error("loading settings", e);
				return null;
			});
			set(s => {
				if (settings) s.settings = settings;
				s.loaded = true;
			});
		},
		update: patch => {
			set(s => {
				Object.assign(s.settings, patch);
			});
			settingsApi.save(get().settings).catch(e => console.error("saving settings", e));
		},
	}))
);

/** Whether the app offers the assistant at all (Settings > Claude) */
export const useAssistantEnabled = () => useSettings(s => s.settings.assistant_enabled);
