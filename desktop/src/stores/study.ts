import { useEffect, useState } from "react";
import { create } from "zustand";
import { certOf } from "@/components/study/data";
import { examApi, type HistoryEntry, type PlanView, type StudyStats } from "@/tauri/api";
import { useExam } from "./exam";
import { useFocus, useShownTargets, useTargets } from "./settings";

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

/**
 * The study of the exams Home and the Calendar show: with one exam aimed
 * at and none in focus, everything; else only the attempts (by `certOf`)
 * and the plans of the exams shown. `history` is null while it is read
 */
export function useShownStudy() {
	const history = useStudy(s => s.history);
	const catalog = useExam(s => s.catalog);
	const aimed = useTargets();
	const shown = useShownTargets();
	const [focus] = useFocus();
	const narrowed = focus !== null || aimed.length > 1;
	const certs = shown.map(t => t.certification);
	const shows = (certification: string) => !narrowed || certs.includes(certification);
	return {
		history: history && (narrowed ? history.filter(h => shows(certOf(h, catalog))) : history),
		/** The plans of the exams shown */
		ofShown: (plans: PlanView[]) => (narrowed ? plans.filter(p => shows(p.certification)) : plans),
	};
}

/**
 * The plans from `from` to `to` (YYYY-MM-DD), read as the range changes
 * and again whenever the study changes (`version`), while `enabled`.
 * `plans` is null until the range's are read (or when the read failed:
 * `failed`); a later range's answer is never overwritten by an earlier
 * one that came after it. `reload` reads them again
 */
export function usePlans(from: string, to: string, { enabled = true } = {}) {
	const version = useStudy(s => s.version);
	const [retry, setRetry] = useState(0);
	const range = `${from}:${to}`;
	const [read, setRead] = useState<{ range: string; plans: PlanView[] | null }>({
		range: "",
		plans: null,
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version or retry is the cue
	useEffect(() => {
		if (!enabled) return;
		let current = true;
		examApi.plans(from, to).then(
			plans => current && setRead({ range, plans }),
			() => current && setRead({ range, plans: null })
		);
		return () => {
			current = false;
		};
	}, [from, to, range, enabled, version, retry]);
	const answered = enabled && read.range === range;
	return {
		plans: answered ? read.plans : null,
		failed: answered && read.plans === null,
		reload: () => setRetry(n => n + 1),
	};
}
