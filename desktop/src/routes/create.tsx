import { useEffect } from "react";
import { toast } from "sonner";
import { Chat } from "@/components/create/chat";
import { DraftStrip } from "@/components/create/draft-header";
import { DraftPanel } from "@/components/create/draft-panel";
import { Inspector, useInspectorFits } from "@/components/shell/inspector";
import { useStudio } from "@/stores/studio";

/**
 * Create with Claude: a conversation building an exam from everything the
 * app knows, the exam in the window's inspector (as tall as the window,
 * like the sidebar), or a bar under the chat on a narrow window. Opening
 * it makes the verify cluster new questions are proven on; leaving keeps it
 * a while (back soon, it is ready) and says so, with a way to remove it at once
 */
export function CreateRoute() {
	const fits = useInspectorFits();
	useEffect(() => {
		const { enter } = useStudio.getState();
		const stop = enter();
		return () => {
			stop.then(fn => fn());
			const { workspace, leave, release } = useStudio.getState();
			leave();
			if (workspace.state === "preparing" || workspace.state === "ready")
				toast("The verify cluster stays 10 minutes for when you come back", {
					action: { label: "Remove now", onClick: release },
				});
		};
	}, []);

	return fits ? (
		<>
			<Chat />
			<Inspector top={<DraftStrip />}>
				<DraftPanel />
			</Inspector>
		</>
	) : (
		<div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
			<Chat />
			<DraftPanel bar />
		</div>
	);
}
