import { CalendarDays, Container, History, LayoutList } from "lucide-react";

/** The app's screens, in the sidebar and the capsule (Settings apart, at the end) */
export const SECTIONS = [
	{ path: "/", label: "Exams", icon: LayoutList },
	{ path: "/history", label: "History", icon: History },
	{ path: "/calendar", label: "Calendar", icon: CalendarDays },
	{ path: "/environment", label: "Environment", icon: Container },
];

/** A screen's name, for the title bar once its own title has scrolled away */
export const screenTitle = (path: string) =>
	path === "/settings" ? "Settings" : SECTIONS.find(s => s.path === path)?.label;
