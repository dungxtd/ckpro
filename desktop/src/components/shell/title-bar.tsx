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
import { SECTIONS } from "./sections";

/**
 * The bar over the content: it moves the window and shows what is running.
 * With the sidebar hidden, the screens float in it as a capsule, beside the
 * window's buttons
 */
export function TitleBar({
	folded,
	onUnfold,
	onSearch,
}: {
	folded: boolean;
	onUnfold: () => void;
	onSearch: () => void;
}) {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	return (
		<div
			data-tauri-drag-region
			className={cn(
				"relative flex h-12 shrink-0 select-none items-center justify-end gap-2 px-3",
				folded && "pl-20"
			)}
		>
			{folded && (
				<Capsule aria-label="Screens" className="absolute left-1/2 -translate-x-1/2">
					<IconButton
						variant="plain"
						size="bar"
						className="rounded-full"
						aria-label="Show sidebar (⌃⌘S)"
						onClick={onUnfold}
					>
						<PanelLeft />
					</IconButton>
					{SECTIONS.map(({ path, label }) =>
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
					<CapsuleItem current={pathname === "/settings"} onClick={() => navigate("/settings")}>
						Settings
					</CapsuleItem>
					<IconButton
						variant="plain"
						size="bar"
						className="rounded-full"
						aria-label="Search exams"
						onClick={onSearch}
					>
						<Search />
					</IconButton>
				</Capsule>
			)}
			<ActivityChip />
		</div>
	);
}
