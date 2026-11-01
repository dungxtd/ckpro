import { useExam } from "@/stores/exam";

/**
 * A question's reference answer behind a Show/Hide toggle. Hiding it again
 * keeps it opened (loaded): the coach knows it was seen.
 */
export function useSolution(questionId: string) {
	const solution = useExam(s => s.solutions[questionId]);
	const hidden = useExam(s => !!s.solutionHidden[questionId]);
	const toggleSolution = useExam(s => s.toggleSolution);
	const shown = !!solution && !hidden;
	return {
		solution: shown ? solution : undefined,
		shown,
		label: shown ? "Hide solution" : "Show solution",
		toggle: () => toggleSolution(questionId),
	};
}
