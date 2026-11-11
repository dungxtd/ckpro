import { useNavigate, useSearchParams } from "react-router";
import { useExam } from "@/stores/exam";
import { useSidebarLayout } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import type { ExamSummary } from "@/tauri/api";
import { arrange, pinned } from "./layout";

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
 * exam picked (the first one until one is). One picked that is not there
 * (deleted) is `missing`, never another in its place
 */
export function useSelection() {
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const catalog = useExam(s => s.catalog);
	const [layout] = useSidebarLayout();
	const stats = useStudy(s => s.byExam);
	const picked = params.get("exam");
	const shown = [
		...pinned(catalog, layout),
		...arrange(catalog, layout, false, stats).flatMap(g => g.exams),
	];
	const found = picked ? (catalog.find(e => e.id === picked) ?? null) : null;
	const exam = picked ? found : (shown[0] ?? catalog[0] ?? null);
	return {
		exam,
		/** The exam picked is gone (the list is read, and has it not) */
		missing: !!picked && !found && catalog.length > 0,
		select: (id: string) => navigate(`/exams?exam=${encodeURIComponent(id)}`),
	};
}
