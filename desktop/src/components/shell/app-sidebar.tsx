import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@ckdry/ui/components/context-menu";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Input } from "@ckdry/ui/components/input";
import { Sidebar, SidebarItem } from "@ckdry/ui/components/sidebar";
import { useDragOrder } from "@ckdry/ui/hooks/use-drag-order";
import { cn } from "@ckdry/ui/lib/utils";
import { PanelLeft, Search, Settings } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ExamList } from "@/components/catalog/exam-list";
import { moved, toggled } from "@/components/catalog/layout";
import { useSidebarLayout } from "@/stores/settings";
import { arrangeScreens } from "./sections";
import { SidebarMenu } from "./sidebar-menu";

/**
 * The app's sidebar: its screens, the exams, Settings. It is arranged where
 * it is: rows are dragged straight into another order; a row's right-click
 * menu is about that row (open it, hide it), a right-click where there is
 * no row opens the sidebar's own menu (what it shows, how it sorts, its
 * order back). `searching`: a field that narrows the exams to those whose
 * title has what is typed
 */
export function AppSidebar({
	folded,
	searching,
	onSearching,
	onFold,
}: {
	/** Slid away (the capsule stands in for it): kept, out of reach */
	folded: boolean;
	searching: boolean;
	onSearching: (on: boolean) => void;
	onFold: () => void;
}) {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [layout, setLayout] = useSidebarLayout();
	const screens = arrangeScreens(layout);
	const dragScreen = useDragOrder("sidebar-screens", (path, target, after) =>
		setLayout({
			screens: moved(
				arrangeScreens(layout, true).map(s => s.path),
				path,
				target,
				after
			),
		})
	);
	const stopSearching = () => {
		setQuery("");
		onSearching(false);
	};

	return (
		// A right-click on a row opens the row's menu; anywhere else, this one
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<Sidebar
					aria-label="Sidebar"
					inert={folded}
					// Its panel is the window's morphing surface (main.tsx): only the
					// rows fade, in once the surface has opened, out before it folds
					className={cn(
						"relative z-20 h-[calc(100%-1rem)] bg-transparent shadow-none transition-opacity motion-reduce:transition-none",
						folded ? "opacity-0 duration-100" : "opacity-100 delay-150 duration-200"
					)}
				>
					{/* Beside the window's buttons (centred on the same line as the
					    title bars'); moves the window */}
					<div
						data-tauri-drag-region
						className="flex h-8 shrink-0 items-center justify-end gap-1 pr-2 pl-20"
					>
						<IconButton
							variant="toolbar"
							size="bar"
							active={searching}
							aria-label="Search exams"
							onClick={() => (searching ? stopSearching() : onSearching(true))}
						>
							<Search />
						</IconButton>
						<IconButton
							variant="toolbar"
							size="bar"
							aria-label="Hide sidebar (⌃⌘S)"
							onClick={onFold}
						>
							<PanelLeft />
						</IconButton>
					</div>
					{searching && (
						// Clear of the buttons above: the field's focus ring has room
						<div className="px-2 pt-2 pb-1">
							<Input
								autoFocus
								type="search"
								aria-label="Search exams"
								placeholder="Search exams"
								className="h-8"
								value={query}
								onChange={e => setQuery(e.target.value)}
								onKeyDown={e => e.key === "Escape" && stopSearching()}
							/>
						</div>
					)}
					<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
						{!searching &&
							screens.map(({ path, label, icon: Icon }) => (
								<ContextMenu key={path}>
									<ContextMenuTrigger asChild>
										<SidebarItem
											icon={<Icon />}
											label={label}
											current={pathname === path}
											onClick={() => navigate(path)}
											className={cn(dragScreen.landing(path))}
											{...dragScreen.row(path)}
										/>
									</ContextMenuTrigger>
									<ContextMenuContent>
										<ContextMenuItem onSelect={() => navigate(path)}>Open</ContextMenuItem>
										{/* Exams is the home screen: always there */}
										{path !== "/" && (
											<ContextMenuItem
												onSelect={() =>
													setLayout({ hidden_screens: toggled(layout.hidden_screens, path, true) })
												}
											>
												Hide {label}
											</ContextMenuItem>
										)}
									</ContextMenuContent>
								</ContextMenu>
							))}
						<ExamList query={searching ? query : ""} />
					</div>
					<div className="border-border border-t p-2">
						<SidebarItem
							icon={<Settings />}
							label="Settings"
							current={pathname.startsWith("/settings")}
							onClick={() => navigate("/settings")}
						/>
					</div>
				</Sidebar>
			</ContextMenuTrigger>
			<SidebarMenu />
		</ContextMenu>
	);
}
