import { Monitor, Palette } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import { AboutSettings } from "@/components/settings/about-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { DeskSettings } from "@/components/settings/desk-settings";
import { InterfaceSettings } from "@/components/settings/interface-settings";
import { Group, Row } from "@/components/settings/layout";
import { Screen } from "@/components/shell/screen";
import { SETTINGS_PARTS } from "@/components/shell/sections";
import { useSettings } from "@/stores/settings";

const THEME_NAMES = { system: "Follow System", light: "Light", dark: "Dark" };

/**
 * The app's settings as macOS apps lay them out: one page of rows that open
 * each part (the interface, the exam desk, the assistant), the
 * app's own rows, and its icon and version at the end. Each part is a page
 * of its own (/settings/<part>). The sidebar is arranged in the sidebar
 */
export function SettingsRoute() {
	const { part } = useParams();
	const navigate = useNavigate();
	const settings = useSettings(s => s.settings);

	if (part) {
		const title = SETTINGS_PARTS[part];
		if (!title) return <Navigate to="/settings" replace />;
		return (
			<Screen title={title} onBack={() => navigate("/settings")} className="max-w-3xl gap-8">
				{part === "interface" && <InterfaceSettings />}
				{part === "desk" && <DeskSettings />}
				{part === "assistant" && <AiSettings />}
			</Screen>
		);
	}
	return (
		<Screen title="Settings" className="max-w-3xl gap-8">
			<Group title="App preferences">
				<Row
					icon={<Palette />}
					label="Interface"
					value={THEME_NAMES[settings.theme]}
					onClick={() => navigate("/settings/interface")}
				/>
				<Row icon={<Monitor />} label="Exam desk" onClick={() => navigate("/settings/desk")} />
			</Group>
			<Group title="Assistant">
				<Row
					icon={<ClaudeIcon />}
					label="Assistant"
					value={settings.assistant_enabled ? "On" : "Off"}
					onClick={() => navigate("/settings/assistant")}
				/>
			</Group>
			<AboutSettings />
		</Screen>
	);
}
