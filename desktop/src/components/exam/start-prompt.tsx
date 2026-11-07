import { ConfirmDialog } from "@cktry/ui/components/confirm-dialog";
import { useExam } from "@/stores/exam";

/**
 * Starting an exam whose clusters are there already asks first, wherever it
 * was started from (Exams, Home's Today, a day of the Calendar, Start over):
 * mounted once, in the layout
 */
export function StartPrompt() {
	const pending = useExam(s => s.pendingReplace);
	const start = useExam(s => s.start);
	const cancel = useExam(s => s.cancelReplace);
	return (
		<ConfirmDialog
			open={pending !== null}
			onOpenChange={open => !open && cancel()}
			title="Replace the clusters?"
			description={pending?.message ?? ""}
			action="Replace and start"
			onConfirm={() => pending && start(pending.id, pending.mode, true)}
		/>
	);
}
