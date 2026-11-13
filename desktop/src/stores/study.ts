import { create } from "zustand";
import { examApi, type HistoryEntry, type StudyStats } from "@/tauri/api";
import { useExam } from "./exam";

export type ExamStats = Map<string, { last: number; score: number | null }>;

/** Each exam's latest finished attempt, from the history */
export function examStats(history: HistoryEntry[]): ExamStats {
	const stats: ExamStats = new Map();
	for (const h of history) {
		const last = h.result.started_at ?? 0;
		if ((stats.get(h.exam_id)?.last ?? -1) < last)
			stats.set(h.exam_id, { last, score: h.result.score });
	}
	return stats;
}

/**
 * The candidate's study as Rust keeps it: the attempts (newest first), each
 * exam's last one, the results per domain; and `version`, bumped each time
 * Rust says it changed (`StudyChanged`), for what a screen reads for itself
 * (a range of plans, a readiness) to read again. Read when the app opens
 * and on every change, never polled
 */
interface Study {
	history: HistoryEntry[] | null;
	stats: StudyStats[];
	byExam: ExamStats;
	version: number;
	/** Read it now and follow every change; returns the unsubscribe */
	connect: () => Promise<() => void>;
}

export const useStudy = create<Study>()(set => {
	const load = async () => {
		// A failed read leaves it empty, not loading for good
		const [history, stats] = await Promise.all([
			examApi.history().catch(() => [] as HistoryEntry[]),
			examApi.studyStats().catch(() => [] as StudyStats[]),
		]);
		set(s => ({ history, stats, byExam: examStats(history), version: s.version + 1 }));
	};
	return {
		history: null,
		stats: [],
		byExam: new Map(),
		version: 0,
		connect: async () => {
			const unsubscribe = await examApi.onStudyChanged(({ catalog }) => {
				if (catalog) useExam.getState().loadCatalog();
				load();
			});
			await load();
			return unsubscribe;
		},
	};
});
