import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckdry/ui/components/select";
import { SunMoon } from "lucide-react";
import { Group, Row } from "@/components/settings/layout";
import { useSettings } from "@/stores/settings";
import type { Theme } from "@/tauri/api";

const THEMES: { value: Theme; label: string }[] = [
	{ value: "system", label: "Follow System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

/** How the app looks: light, dark, or as macOS is */
export function InterfaceSettings() {
	const theme = useSettings(s => s.settings.theme);
	const update = useSettings(s => s.update);
	return (
		<Group title="Appearance" description="The exam desktop keeps its own look, as on the exam.">
			<Row icon={<SunMoon />} label="Theme">
				<Select value={theme} onValueChange={value => update({ theme: value as Theme })}>
					<SelectTrigger aria-label="Theme">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{THEMES.map(t => (
							<SelectItem key={t.value} value={t.value}>
								{t.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>
		</Group>
	);
}
