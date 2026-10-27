import { useState } from "react";
import { useExam } from "@/stores/exam";

/**
 * A question's reference answer behind a Show/Hide toggle. Hiding it again
 * keeps it opened (loaded): the coach knows it was seen.
 */
export function useSolution(questionId: string) {
	const solution = useExam(s => s.solutions[questionId]);
	const loadSolution = useExam(s => s.loadSolution);
	const [hidden, setHidden] = useState(false);
	const shown = !!solution && !hidden;
	return {
		solution: shown ? solution : undefined,
		shown,
		label: shown ? "Hide solution" : "Show solution",
		toggle: () => (solution ? setHidden(shown) : loadSolution(questionId)),
	};
}
