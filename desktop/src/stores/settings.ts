import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { useShallow } from "zustand/react/shallow";
import {
	type ExamTarget,
	errorText,
	type HomeLayout,
	type Settings,
	type SidebarLayout,
	settingsApi,
} from "@/tauri/api";

interface SettingsStore {
	/** Mirror of what the app database keeps */
	settings: Settings;
	/** Read once at start: the desk opens as it was left, not with defaults first */
	loaded: boolean;
	/** Why they could not be read; the app waits for a retry rather than
	 * opening on defaults it would then save over them */
	error: string | null;
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
			analytics: true,
			sidebar_folded: false,
			sidebar: {
				groups: [],
				exams: [],
				collapsed: [],
				hidden: [],
				screens: [],
				hidden_screens: [],
				pinned: [],
				sort: {},
			},
			theme: "dark",
			targets: [],
			target: null,
			focus: null,
			home: { places: [], hidden: [], custom: false },
		},
		loaded: false,
		error: null,
		load: async () => {
			set(s => {
				s.error = null;
			});
			try {
				const settings = await settingsApi.load();
				set(s => {
					s.settings = settings;
					s.loaded = true;
				});
			} catch (e) {
				set(s => {
					s.error = errorText(e);
				});
			}
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

/** How the sidebar lists the screens and the exams, and a change to it (saved) */
export function useSidebarLayout() {
	const layout = useSettings(s => s.settings.sidebar);
	const update = useSettings(s => s.update);
	return [
		layout,
		(patch: Partial<SidebarLayout>) =>
			update({ sidebar: { ...useSettings.getState().settings.sidebar, ...patch } }),
	] as const;
}

/** The exams the candidate prepares for, the nearest first */
export function useTargets(): ExamTarget[] {
	return useSettings(
		useShallow(s => [...s.settings.targets].sort((a, b) => a.date.localeCompare(b.date)))
	);
}

/** The certification Home and the Calendar show (`null`: all the exams aimed
 * at), and a change to it; a focus on an exam no longer aimed at is all */
export function useFocus() {
	const focus = useSettings(s =>
		s.settings.targets.some(t => t.certification === s.settings.focus) ? s.settings.focus : null
	);
	const update = useSettings(s => s.update);
	return [focus, (certification: string | null) => update({ focus: certification })] as const;
}

/** The exams shown: the one in focus, or all of them */
export function useShownTargets(): ExamTarget[] {
	const targets = useTargets();
	const [focus] = useFocus();
	return focus ? targets.filter(t => t.certification === focus) : targets;
}

/** How Home's modules are arranged, and a change to it (saved) */
export function useHomeLayout() {
	const layout = useSettings(s => s.settings.home);
	const update = useSettings(s => s.update);
	return [
		layout,
		(patch: Partial<HomeLayout>) =>
			update({ home: { ...useSettings.getState().settings.home, ...patch } }),
	] as const;
}
