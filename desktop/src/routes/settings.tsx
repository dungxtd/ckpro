import { Tile } from "@ckdry/ui/components/tile";
import { Info, Monitor, Sparkles } from "lucide-react";
import { AboutSettings } from "@/components/settings/about-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { DeskSettings } from "@/components/settings/desk-settings";
import { Screen } from "@/components/shell/screen";

const PARTS = [
	{ id: "desk", label: "Exam desk", icon: Monitor },
	{ id: "ai", label: "Assistant", icon: Sparkles },
	{ id: "about", label: "About", icon: Info },
];

/**
 * The app's settings on one page, as macOS settings group them: the exam
 * desk, the AI (the assistant, its Claude Code runtime, what its agent may do
 * and what it is given), and the app. The tiles go to each part
 */
export function SettingsRoute() {
	return (
		<Screen title="Settings" className="max-w-3xl gap-8">
			<div className="flex flex-wrap gap-3">
				{PARTS.map(({ id, label, icon: Icon }) => (
					<Tile
						key={id}
						icon={<Icon />}
						label={label}
						onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
					/>
				))}
			</div>
			<div id="desk" className="scroll-mt-14">
				<DeskSettings />
			</div>
			<div id="ai" className="flex scroll-mt-14 flex-col gap-8">
				<AiSettings />
			</div>
			<div id="about" className="flex scroll-mt-14 flex-col gap-8">
				<AboutSettings />
			</div>
		</Screen>
	);
}
