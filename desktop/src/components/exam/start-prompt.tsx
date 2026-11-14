import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { useExam } from "@/stores/exam";
import { shortTitle } from "@/titles";
import { startLabel } from "@/words";

/**
 * Starting an exam picked in a list (a plan, a retry) asks first, and one
 * whose clusters are there already asks to replace them, wherever it was
 * started from (Exams, Home's Today, a day of the Calendar, Start over):
 * mounted once, in the layout
 */
export function StartPrompt() {
	const pending = useExam(s => s.pendingReplace);
	const picked = useExam(s => s.pendingStart);
	const start = useExam(s => s.start);
	const cancel = useExam(s => s.cancelReplace);
	const cancelStart = useExam(s => s.cancelStart);
	return (
		<>
			<ConfirmDialog
				open={picked !== null}
				onOpenChange={open => !open && cancelStart()}
				tone="default"
				title={`${startLabel(picked?.mode === "exam" ? "exam" : "practice")}: ${picked ? shortTitle(picked.title) : ""}?`}
				description={
					picked?.mode === "exam"
						? "Timed as the real exam: no hints, no checks, no assistant."
						: "With hints, checks and the assistant, at your own pace."
				}
				action="Start"
				onConfirm={() => picked && start(picked.id, picked.mode)}
			/>
			<ConfirmDialog
				open={pending !== null}
				onOpenChange={open => !open && cancel()}
				title="Replace the clusters?"
				description={pending?.message ?? ""}
				action="Replace and start"
				onConfirm={() => pending && start(pending.id, pending.mode, true)}
			/>
		</>
	);
}
