import { CalendarDays, Container, History, House } from "lucide-react";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import type { SidebarLayout } from "@/tauri/api";

/** The app's screens, in the sidebar and the capsule (Settings apart, at the end) */
export const SECTIONS = [
	{ path: "/", label: "Home", icon: House },
	{ path: "/calendar", label: "Calendar", icon: CalendarDays },
	{ path: "/create", label: "Create", icon: AssistantIcon },
	{ path: "/history", label: "History", icon: History },
	{ path: "/environment", label: "Environment", icon: Container },
];

/** Screens there only with the assistant on (AI is optional) */
const ASSISTANT_SCREENS = ["/create"];

/** Settings' own pages, under /settings/<part> */
export const SETTINGS_PARTS: Record<string, string> = {
	interface: "Interface",
	desk: "Exam desk",
	assistant: "Assistant",
};

/**
 * The screens as the sidebar lists them: in the order the candidate dragged
 * them (the rest after, as they come), hidden ones left out unless
 * `withHidden`, the assistant's only with `assistant`. Home is never hidden
 */
export function arrangeScreens(
	layout: SidebarLayout,
	{ withHidden = false, assistant = true } = {}
) {
	const rank = (path: string, i: number) => {
		const at = layout.screens.indexOf(path);
		return at >= 0 ? at : layout.screens.length + i;
	};
	return SECTIONS.map((s, i) => [s, rank(s.path, i)] as const)
		.sort((a, b) => a[1] - b[1])
		.map(([s]) => s)
		.filter(s => assistant || !ASSISTANT_SCREENS.includes(s.path))
		.filter(s => withHidden || s.path === "/" || !layout.hidden_screens.includes(s.path));
}

/** A screen's name, for the title bar once its own title has scrolled away */
export function screenTitle(path: string) {
	if (path === "/settings") return "Settings";
	if (path === "/exams") return "Exams";
	const part = path.match(/^\/settings\/(\w+)$/)?.[1];
	if (part) return SETTINGS_PARTS[part];
	return SECTIONS.find(s => s.path === path)?.label;
}
