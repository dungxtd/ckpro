import { Container, History, LayoutList } from "lucide-react";

/** The app's screens, in the sidebar and the capsule (Settings apart, at the end) */
export const SECTIONS = [
	{ path: "/", label: "Exams", icon: LayoutList },
	{ path: "/history", label: "History", icon: History },
	{ path: "/environment", label: "Environment", icon: Container },
];
