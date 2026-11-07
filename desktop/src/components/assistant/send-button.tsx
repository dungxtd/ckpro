import { IconButton } from "@cktry/ui/components/icon-button";
import { ArrowUp, Square } from "lucide-react";
import type { KeyboardEvent } from "react";

/** Enter sends what is written; Shift+Enter, or Enter while composing
 * (an input method's candidate), is a new line */
export function sendOnEnter(send: () => void) {
	return (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			send();
		}
	};
}

/** Send what is written, or, while an answer is written, stop it */
export function SendButton({
	writing,
	disabled,
	onSend,
	onStop,
	size = "xs",
}: {
	writing: boolean;
	/** Nothing to send yet */
	disabled?: boolean;
	onSend: () => void;
	onStop: () => void;
	size?: "xs" | "sm";
}) {
	return writing ? (
		<IconButton
			variant="toolbar"
			size={size}
			className="text-destructive"
			aria-label="Stop"
			onClick={onStop}
		>
			<Square className="fill-current" />
		</IconButton>
	) : (
		<IconButton
			variant="toolbar"
			size={size}
			aria-label="Send"
			disabled={disabled}
			onClick={onSend}
		>
			<ArrowUp />
		</IconButton>
	);
}
