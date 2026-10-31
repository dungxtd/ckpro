import { Capsule, CapsuleItem } from "@ckdry/ui/components/capsule";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@ckdry/ui/components/dropdown-menu";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { cn } from "@ckdry/ui/lib/utils";
import { ChevronDown, PanelLeft, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { ActivityChip } from "@/components/activity/activity-chip";
import { ExamMenuItems } from "@/components/catalog/exam-list";
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
}: {
	folded: boolean;
	title?: string;
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
			<Capsule
				aria-label="Screens"
				inert={!folded}
				className={cn(
					"absolute left-1/2 -translate-x-1/2 transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
					folded ? "scale-100 opacity-100 delay-100" : "pointer-events-none scale-90 opacity-0"
				)}
			>
				<IconButton
					variant="toolbar"
					size="bar"
					className="rounded-full"
					aria-label="Show sidebar (⌃⌘S)"
					onClick={onUnfold}
				>
					<PanelLeft />
				</IconButton>
				{arrangeScreens(layout).map(({ path, label }) =>
					path === "/" ? (
						<DropdownMenu key={path}>
							<DropdownMenuTrigger asChild>
								<CapsuleItem current={pathname === path}>
									{label}
									<ChevronDown />
								</CapsuleItem>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="center">
								<ExamMenuItems />
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<CapsuleItem key={path} current={pathname === path} onClick={() => navigate(path)}>
							{label}
						</CapsuleItem>
					)
				)}
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
			<ActivityChip />
		</div>
	);
}
