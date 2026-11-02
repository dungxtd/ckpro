import { Capsule, CapsuleItem } from "@cktry/ui/components/capsule";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@cktry/ui/components/dropdown-menu";
import { IconButton } from "@cktry/ui/components/icon-button";
import { mac } from "@cktry/ui/lib/platform";
import { cn } from "@cktry/ui/lib/utils";
import { ChevronDown, PanelLeft, Search } from "lucide-react";
import type * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { ActivityChip } from "@/components/activity/activity-chip";
import { ExamMenuItems } from "@/components/catalog/exam-list";
import { WindowControls } from "@/components/shell/window-controls";
import { SHORTCUTS } from "@/shortcuts";
import { useSidebarLayout } from "@/stores/settings";
import { arrangeScreens } from "./sections";

/**
 * The bar over the content: it moves the window and shows what is running.
 * With the sidebar hidden, the screens float in it as a capsule, beside the
 * window's buttons; else the screen's name, once its own title scrolled away
 */
export function TitleBar({
	folded,
	title,
	onUnfold,
	onSearch,
	capsuleRef,
}: {
	folded: boolean;
	title?: string;
	/** The capsule, which the window's surface takes the shape of while folded */
	capsuleRef?: React.Ref<HTMLElement>;
	onUnfold: () => void;
	onSearch: () => void;
}) {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [layout] = useSidebarLayout();
	return (
		<div
			data-tauri-drag-region
			className="relative flex h-12 shrink-0 select-none items-center justify-end gap-2 px-3"
		>
			<span
				aria-hidden={!title || folded}
				className={cn(
					"pointer-events-none absolute left-1/2 -translate-x-1/2 font-semibold text-callout transition-opacity duration-200",
					title && !folded ? "opacity-100" : "opacity-0"
				)}
			>
				{title}
			</span>
			{/* Its pill is the window's morphing surface (main.tsx): only the
			    items fade, in as the surface reaches its shape, out as it leaves */}
			<Capsule
				ref={capsuleRef}
				aria-label="Screens"
				inert={!folded}
				className={cn(
					"absolute left-1/2 z-20 -translate-x-1/2 bg-transparent shadow-none backdrop-blur-none transition-opacity motion-reduce:transition-none",
					folded
						? "opacity-100 delay-200 duration-200"
						: "pointer-events-none opacity-0 duration-100"
				)}
			>
				<IconButton
					variant="toolbar"
					size="bar"
					className="rounded-full"
					aria-label={`Show sidebar (${SHORTCUTS.sidebar.label})`}
					onClick={onUnfold}
				>
					<PanelLeft />
				</IconButton>
				{arrangeScreens(layout).map(({ path, label }) => (
					<CapsuleItem key={path} current={pathname === path} onClick={() => navigate(path)}>
						{label}
					</CapsuleItem>
				))}
				{/* The exams, which the sidebar lists, as a menu */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<CapsuleItem current={pathname === "/exams"}>
							Exams
							<ChevronDown />
						</CapsuleItem>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="center">
						<ExamMenuItems />
					</DropdownMenuContent>
				</DropdownMenu>
				<CapsuleItem
					current={pathname.startsWith("/settings")}
					onClick={() => navigate("/settings")}
				>
					Settings
				</CapsuleItem>
				<IconButton
					variant="toolbar"
					size="bar"
					className="rounded-full"
					aria-label="Search exams"
					onClick={onSearch}
				>
					<Search />
				</IconButton>
			</Capsule>
			<ActivityChip compact={folded} />
			{!mac && <WindowControls />}
		</div>
	);
}
