import { Button } from "@ckpro/ui/components/button";
import { CodeBlock } from "@ckpro/ui/components/code-block";
import { useEffect } from "react";
import type { PermissionOption } from "@/tauri/api";

/**
 * The agent asks to run a command, or to use one of the app's tools (`tool`,
 * in words): run it (Enter) or skip it (Escape). What runs unasked is
 * Settings' Tool access, never an "always" given here
 */
export function PermissionCard({
	command,
	tool,
	options,
	onAnswer,
}: {
	command: string;
	tool?: string | null;
	options: PermissionOption[];
	onAnswer: (option: string | null) => void;
}) {
	const once = options.find(o => o.kind === "allow_once");
	const reject =
		options.find(o => o.kind === "reject_once") ?? options.find(o => o.kind === "reject_always");
	useEffect(() => {
		// A key already down when the card came (the Enter that sent the
		// message) does not answer it
		const shown = performance.now();
		const keys = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.repeat || performance.now() - shown < 400) return;
			// Not while typing a message (focus stays in the editor after sending)
			const typing = e.target instanceof HTMLTextAreaElement && e.target.value.trim() !== "";
			// Enter on another control (Skip, a field) is that control's
			const control =
				e.target instanceof HTMLElement &&
				(e.target.isContentEditable ||
					e.target.closest("button, a[href], input, select, [role=menuitem], [role=option]") !==
						null);
			if (e.key === "Enter" && once && !typing && !control) {
				e.preventDefault();
				onAnswer(once.id);
			}
			if (e.key === "Escape") {
				e.preventDefault();
				onAnswer(reject?.id ?? null);
			}
		};
		window.addEventListener("keydown", keys);
		return () => window.removeEventListener("keydown", keys);
	}, [once, reject, onAnswer]);
	return (
		<div className="flex flex-col gap-2 border-border border-t bg-card/60 p-3">
			{tool ? (
				<span className="text-callout">{tool}?</span>
			) : (
				<>
					<span className="text-muted-foreground text-caption">Run on the task's host?</span>
					<CodeBlock wrap className="max-h-32">
						$ {command}
					</CodeBlock>
				</>
			)}
			<div className="flex flex-wrap justify-end gap-1.5">
				<Button size="push" variant="push" onClick={() => onAnswer(reject?.id ?? null)}>
					Skip <kbd className="text-muted-foreground text-caption">esc</kbd>
				</Button>
				{once && (
					<Button size="push" variant="pushDefault" onClick={() => onAnswer(once.id)}>
						Run <kbd className="opacity-70 text-caption">↵</kbd>
					</Button>
				)}
			</div>
		</div>
	);
}
