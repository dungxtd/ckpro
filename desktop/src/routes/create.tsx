import { useEffect } from "react";
import { Chat } from "@/components/create/chat";
import { DraftStrip } from "@/components/create/draft-header";
import { DraftPanel } from "@/components/create/draft-panel";
import { Inspector, useInspectorFits } from "@/components/shell/inspector";
import { useStudio } from "@/stores/studio";

/**
 * Create with Claude: a conversation building an exam from everything the
 * app knows, the exam in the window's inspector (as tall as the window,
 * like the sidebar), or a bar under the chat on a narrow window. Its
 * questions are proven on a cluster made when the candidate asks, for that
 * proof alone
 */
export function CreateRoute() {
	const fits = useInspectorFits();
	useEffect(() => {
		const stop = useStudio.getState().enter();
		return () => {
			stop.then(fn => fn());
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
