import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { type Settings, settingsApi } from "@/tauri/api";

interface SettingsStore {
	/** Mirror of what the app database keeps */
	settings: Settings;
	load: () => Promise<void>;
	/** Change some settings; saved to the app database */
	update: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>()(
	immer((set, get) => ({
		settings: { desktop_zoom: 1, desktop_resolution: null, question_size: 1 },
		load: async () => {
			const settings = await settingsApi.load();
			set(s => {
				s.settings = settings;
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
