import { CircleArrowUp, Monitor, Palette } from "lucide-react";
import type { ComponentType } from "react";
import { AssistantIcon } from "@/components/assistant/assistant-icon";

/** One of Settings' parts, at /settings/<part>; no icon: the app's own
 * (About: its row draws it) */
interface Part {
	part: string;
	label: string;
	icon: ComponentType | null;
}

/** Settings' parts as its list groups them: how the app looks and works,
 * the assistant, the app itself */
export const SETTINGS_GROUPS = [
	[
		{ part: "appearance", label: "Appearance", icon: Palette },
		{ part: "desk", label: "Exam desk", icon: Monitor },
	],
	[{ part: "assistant", label: "Assistant", icon: AssistantIcon }],
	[
		{ part: "updates", label: "Updates", icon: CircleArrowUp },
		{ part: "about", label: "About", icon: null },
	],
] as const satisfies readonly (readonly Part[])[];

/** Every part, in the list's order */
export const SETTINGS_PARTS = SETTINGS_GROUPS.flat();

export type SettingsPart = (typeof SETTINGS_PARTS)[number]["part"];
