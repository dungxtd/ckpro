import { toast } from "sonner";
import { create } from "zustand";
import { browserApi, errorText, type UpdateInfo, type UpdateStatus, updateApi } from "@/tauri/api";

export type { UpdateInfo, UpdateStatus };

/**
 * The app's updates, as Rust has them: whether one is coming, downloaded,
 * required, or has to be installed by hand. Rust checks, downloads and
 * installs; the interface shows what it is sent (`UpdateChanged`) and asks
 * for a restart.
 */
interface UpdateStore {
	/** None until Rust answered */
	info: UpdateInfo | null;
	/** Follow the updates for the life of the app; `onUpdated`: the version
	 * this run replaced, said once as the app opens */
	connect: (onUpdated: (from: string, to: string) => void) => Promise<() => void>;
}

/** The update this run replaced was said */
let saidUpdated = false;

export const useUpdate = create<UpdateStore>()(set => ({
	info: null,
	connect: async onUpdated => {
		const stop = await updateApi.onChanged(info => set({ info }));
		const info = await updateApi.state();
		// What came meanwhile is newer than this answer
		set(s => ({ info: s.info ?? info }));
		// Said once a run, however often the interface connects
		if (info.updated_from && !saidUpdated) {
			saidUpdated = true;
			onUpdated(info.updated_from, info.current);
		}
		return stop;
	},
}));

/** What the update's controls do: Rust acts, its answer comes as a change;
 * a refusal (an attempt runs) is said */
export const updateActions = {
	restart: () => updateApi.restart().catch(e => toast.error(errorText(e))),
	check: () => updateApi.check(),
	dismiss: () => updateApi.dismiss().catch(e => toast.error(errorText(e))),
	/** The release page, for an update installed by hand */
	download: (status: UpdateStatus) => {
		if (status.state === "manual")
			browserApi.open(status.url).catch(e => toast.error(errorText(e)));
	},
};

/** A release's page: what it brings */
export const releaseUrl = (version: string) =>
	`https://github.com/dungxtd/ckpro/releases/tag/v${version}`;

/** A newer version is required: no new attempt starts until it runs */
export const isRequired = (s: UpdateStatus) =>
	(s.state === "ready" || s.state === "manual") && s.required;

/** Where an update is, in a few words (Settings' list) */
export function updateSummary(s: UpdateStatus) {
	switch (s.state) {
		case "idle":
			return "Up to date";
		case "checking":
			return "Checking…";
		case "downloading":
			return `Downloading ${s.version}`;
		case "ready":
			return `${s.version} ready to install`;
		case "manual":
			return `${s.version} available`;
		case "failed":
			return "Could not check";
		case "restarting":
			return `Installing ${s.version}`;
	}
}

/** Bytes as the candidate reads them: 38 MB, 1.2 GB */
export function size(bytes: number) {
	const mb = bytes / 1_048_576;
	return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

/** How long ago a check was: just now, 5 min ago, 2 h ago, 3 days ago */
export function ago(at: number, now = Date.now()) {
	const min = Math.round((now - at) / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min} min ago`;
	const h = Math.round(min / 60);
	if (h < 24) return `${h} h ago`;
	const d = Math.round(h / 24);
	return d === 1 ? "yesterday" : `${d} days ago`;
}
