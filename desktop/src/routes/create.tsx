import { Button } from "@ckpro/ui/components/button";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Chat } from "@/components/create/chat";
import { DraftStrip } from "@/components/create/draft-header";
import { DraftPanel } from "@/components/create/draft-panel";
import { Inspector, useInspectorFits } from "@/components/shell/inspector";
import { Screen } from "@/components/shell/screen";
import { useAssistantEnabled } from "@/stores/settings";
import { useStudio } from "@/stores/studio";

/**
 * Create with Claude: a conversation building an exam from everything the
 * app knows, the exam in the window's inspector (as tall as the window,
 * like the sidebar), or a bar under the chat on a narrow window. Its
 * questions are proven on a cluster made when the candidate asks, for that
 * proof alone
 */
export function CreateRoute() {
	// Turned off, the app has no AI: nothing is opened, the way back is shown
	return useAssistantEnabled() ? <CreateScreen /> : <AssistantOff />;
}

function AssistantOff() {
	const navigate = useNavigate();
	return (
		<Screen title="Create">
			<Placeholder
				className="mt-10"
				sample={<div className="h-40 rounded-xl border border-border bg-card" />}
				title="The assistant is turned off"
				description="Create builds exams with it. Turn it on in Settings to use it."
				action={
					<Button size="push" variant="push" onClick={() => navigate("/settings/assistant")}>
						Open Settings
					</Button>
				}
			/>
		</Screen>
	);
}

function CreateScreen() {
	const fits = useInspectorFits();
	useEffect(() => useStudio.getState().enter(), []);

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
