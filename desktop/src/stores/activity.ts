import { useMemo } from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { type Activity, activityApi } from "@/tauri/api";

const LOG_LINES = 500;
/** Finished activities kept, as on the Rust side */
const KEPT = 20;

interface ActivityStore {
	/** By id; the Rust side keeps the last 20 */
	byId: Record<number, Activity>;
	connect: () => Promise<() => void>;
}

/** Mirror of the app's long operations (preparing, cleaning up, grading…). */
export const useActivities = create<ActivityStore>()(
	immer(set => ({
		byId: {},
		connect: async () => {
			const stopChanged = await activityApi.onChanged(activity =>
				set(s => {
					// Changes come without the log: keep the lines already here
					const log = s.byId[activity.id]?.log ?? activity.log;
					s.byId[activity.id] = { ...activity, log };
					// As many finished ones as the Rust side keeps
					const finished = Object.values(s.byId)
						.filter(a => a.status !== "running")
						.sort((a, b) => b.id - a.id);
					for (const old of finished.slice(KEPT)) delete s.byId[old.id];
				})
			);
			const stopLog = await activityApi.onLog((id, line) =>
				set(s => {
					const activity = s.byId[id];
					if (!activity) return;
					activity.log.push(line);
					if (activity.log.length > LOG_LINES)
						activity.log.splice(0, activity.log.length - LOG_LINES);
				})
			);
			const list = await activityApi.list();
			set(s => {
				for (const activity of list) s.byId[activity.id] = activity;
				// The Rust side forgets old ones; so does the UI
				const keep = new Set(list.map(a => a.id));
				for (const id of Object.keys(s.byId).map(Number)) {
					if (!keep.has(id) && s.byId[id]?.status !== "running" && id < Math.min(...keep))
						delete s.byId[id];
				}
			});
			return () => {
				stopChanged();
				stopLog();
			};
		},
	}))
);

/** Newest first. Selects the stable `byId` and sorts outside the selector:
 * a selector returning a new array each time re-renders forever. */
export const useActivityList = () => {
	const byId = useActivities(s => s.byId);
	return useMemo(() => Object.values(byId).sort((a, b) => b.id - a.id), [byId]);
};
