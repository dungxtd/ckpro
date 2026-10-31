import { AboutSettings } from "@/components/settings/about-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { DeskSettings } from "@/components/settings/desk-settings";
import { Screen } from "@/components/shell/screen";

/**
 * The app's settings on one page, as macOS settings group them: the exam
 * desk, the AI (the assistant, its Claude Code runtime, what its agent may do
 * and what it is given), and the app, ending with its icon and version
 */
export function SettingsRoute() {
	return (
		<Screen title="Settings" className="max-w-3xl gap-8">
			<DeskSettings />
			<AiSettings />
			<AboutSettings />
		</Screen>
	);
}
