import { useEffect } from "react";
import { toast } from "sonner";
import { Chat } from "@/components/create/chat";
import { DraftPanel } from "@/components/create/draft-panel";
import { useStudio } from "@/stores/studio";

/**
 * Create with Claude: a conversation (left) building an exam (right) from
 * everything the app knows. Opening it makes the verify cluster new questions
 * are proven on; leaving keeps it a while (back soon, it is ready) and says
 * so, with a way to remove it at once
 */
export function CreateRoute() {
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

	return (
		// The draft beside the chat on a wide window; on a narrow one the chat
		// takes the height and the draft folds into a bar under it
		<div className="@container h-full min-h-0">
			<div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] @3xl:grid-rows-1">
				<Chat />
				<DraftPanel />
			</div>
		</div>
	);
}
