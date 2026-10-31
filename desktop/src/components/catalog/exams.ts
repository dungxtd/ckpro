import { useNavigate, useSearchParams } from "react-router";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import type { ExamSummary, SidebarLayout } from "@/tauri/api";
import { arrange } from "./layout";

export const gb = (mb: number) => (mb / 1024).toFixed(1);

/** An exam's name where its certification shows already (its heading, a
 * calendar day): without the certification and "Practice Lab" */
export const shortTitle = (title: string) =>
	title.replace(/^CK(A|AD|S)\s+/i, "").replace(/^Practice Lab\s*-\s*/i, "");

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

/** The Exams screen's other view, beside an exam: the question generator */
const GENERATE = "generate";

/**
 * What the Exams screen shows, kept in the URL (`/?exam=<id>`, or
 * `/?exam=generate`): the exam picked (the first one until one is), or the
 * generator
 */
export function useSelection() {
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const catalog = useExam(s => s.catalog);
	const [layout] = useSidebarLayout();
	const picked = params.get("exam");
	const generating = picked === GENERATE;
	const shown = arrange(catalog, layout).flatMap(g => g.exams);
	const exam = catalog.find(e => e.id === picked) ?? shown[0] ?? catalog[0] ?? null;
	return {
		exam,
		generating,
		select: (id: string) => navigate(`/?exam=${encodeURIComponent(id)}`),
		generate: () => navigate(`/?exam=${GENERATE}`),
	};
}

/** How the sidebar lists the exams, and a change to it (saved) */
export function useSidebarLayout() {
	const layout = useSettings(s => s.settings.sidebar);
	const update = useSettings(s => s.update);
	return [
		layout,
		(patch: Partial<SidebarLayout>) =>
			update({ sidebar: { ...useSettings.getState().settings.sidebar, ...patch } }),
	] as const;
}
