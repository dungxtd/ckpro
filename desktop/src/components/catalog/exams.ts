import { useNavigate, useSearchParams } from "react-router";
import { create } from "zustand";
import { useExam } from "@/stores/exam";
import { useSidebarLayout } from "@/stores/settings";
import { type ExamSummary, examApi } from "@/tauri/api";
import { arrange, type ExamStats, examStats, pinned } from "./layout";

export const gb = (mb: number) => (mb / 1024).toFixed(1);

/**
 * How an exam fits Docker's memory (`dockerMb`, when Docker is up). Clearly
 * too small whatever runs; the exact check (running clusters counted)
 * happens on start. Between the minimum and the comfortable size it runs,
 * slower
 */
export type Fit = "unknown" | "fits" | "slower" | "too-small";
export function memoryFit(exam: ExamSummary, dockerMb: number | null): Fit {
	if (dockerMb === null) return "unknown";
	if (dockerMb < exam.minimum_mb) return "too-small";
	return dockerMb < exam.memory_mb ? "slower" : "fits";
}

/**
 * What the Exams screen shows, kept in the URL (`/exams?exam=<id>`): the
 * exam picked (the first one until one is)
 */
export function useSelection() {
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const catalog = useExam(s => s.catalog);
	const [layout] = useSidebarLayout();
	const stats = useExamStats(s => s.stats);
	const picked = params.get("exam");
	const shown = [
		...pinned(catalog, layout),
		...arrange(catalog, layout, false, stats).flatMap(g => g.exams),
	];
	const exam = catalog.find(e => e.id === picked) ?? shown[0] ?? catalog[0] ?? null;
	return {
		exam,
		select: (id: string) => navigate(`/exams?exam=${encodeURIComponent(id)}`),
	};
}

/** Each exam's last attempt, for the sidebar's sorts: read again once an
 * attempt is over (`load`) */
export const useExamStats = create<{ stats: ExamStats; load: () => void }>()(set => ({
	stats: new Map(),
	load: () => {
		examApi.history().then(history => set({ stats: examStats(history) }));
	},
}));
