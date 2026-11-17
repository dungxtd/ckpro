import type { ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { AboutSettings } from "@/components/settings/about-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { AppearanceSettings, THEMES } from "@/components/settings/appearance-settings";
import { DeskSettings } from "@/components/settings/desk-settings";
import { Group, Row } from "@/components/settings/layout";
import { SETTINGS_GROUPS, SETTINGS_PARTS, type SettingsPart } from "@/components/settings/parts";
import { UpdateSettings } from "@/components/settings/update-group";
import { Screen } from "@/components/shell/screen";
import { useSettings } from "@/stores/settings";
import { updateSummary, useUpdate } from "@/stores/update";
import appIcon from "../../src-tauri/icons/128x128@2x.png";

/** Each part's page */
const PAGES: Record<SettingsPart, () => ReactNode> = {
	appearance: () => <AppearanceSettings />,
	desk: () => <DeskSettings />,
	assistant: () => <AiSettings />,
	updates: () => <UpdateSettings />,
	about: () => <AboutSettings />,
};

/**
 * The app's settings as macOS apps lay them out: one page of rows, each
 * part with where it stands, that open the part's own page
 * (/settings/<part>), its chevron back to the list
 */
export function SettingsRoute() {
	const { part } = useParams();
	const navigate = useNavigate();
	if (!part)
		return (
			<Screen title="Settings" className="gap-8">
				<PartList />
			</Screen>
		);
	const shown = SETTINGS_PARTS.find(p => p.part === part);
	if (!shown) return <Navigate to="/settings" replace />;
	return (
		<Screen title={shown.label} onBack={() => navigate("/settings")} className="gap-8">
			{PAGES[shown.part]()}
		</Screen>
	);
}

/** The parts, grouped, each row saying where it stands */
function PartList() {
	const navigate = useNavigate();
	const theme = useSettings(s => s.settings.theme);
	const assistant = useSettings(s => s.settings.assistant_enabled);
	const update = useUpdate(s => s.info);
	const value: Partial<Record<SettingsPart, string>> = {
		appearance: THEMES.find(t => t.value === theme)?.label,
		assistant: assistant ? "On" : "Off",
		updates: update ? updateSummary(update.status) : undefined,
		about: update ? `Version ${update.current}` : undefined,
	};
	return SETTINGS_GROUPS.map(group => (
		<Group key={group[0].part}>
			{group.map(p => (
				<Row
					key={p.part}
					icon={p.icon ? <p.icon /> : <img src={appIcon} alt="" className="size-5" />}
					label={p.label}
					value={value[p.part]}
					onClick={() => navigate(`/settings/${p.part}`)}
				/>
			))}
		</Group>
	));
}
