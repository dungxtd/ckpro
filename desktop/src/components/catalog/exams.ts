import { useNavigate, useSearchParams } from "react-router";
import { useExam } from "@/stores/exam";
import type { ExamSummary } from "@/tauri/api";

const CERT_ORDER = ["cka", "ckad", "cks"];

export const gb = (mb: number) => (mb / 1024).toFixed(1);

/** An exam's name under its certification's heading: without the
 * certification and "Practice Lab" the heading already says */
export const shortTitle = (exam: ExamSummary) =>
	exam.title
		.replace(new RegExp(`^${exam.certification}\\s+`, "i"), "")
		.replace(/^Practice Lab\s*-\s*/i, "");

/** The exams by certification, in the order the certifications are taken */
export function byCertification(catalog: ExamSummary[]): [string, ExamSummary[]][] {
	const certs = [...new Set(catalog.map(e => e.certification))].sort(
		(a, b) => CERT_ORDER.indexOf(a) - CERT_ORDER.indexOf(b)
	);
	return certs.map(cert => [cert, catalog.filter(e => e.certification === cert)]);
}

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
	const picked = params.get("exam");
	const generating = picked === GENERATE;
	const ordered = byCertification(catalog).flatMap(([, exams]) => exams);
	const exam = ordered.find(e => e.id === picked) ?? ordered[0] ?? null;
	return {
		exam,
		generating,
		select: (id: string) => navigate(`/?exam=${encodeURIComponent(id)}`),
		generate: () => navigate(`/?exam=${GENERATE}`),
	};
}
