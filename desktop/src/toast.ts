import { toast } from "sonner";
import { errorText } from "@/tauri/api";

/**
 * Say a change was made, with Undo: `undo` reverts it, and its failure is
 * said as an error rather than lost; `after` runs once it is undone
 */
export function toastUndo(message: string, undo: () => Promise<unknown>, after?: () => void) {
	toast(message, {
		action: {
			label: "Undo",
			onClick: () =>
				undo().then(
					() => after?.(),
					e => toast.error(errorText(e))
				),
		},
	});
}
