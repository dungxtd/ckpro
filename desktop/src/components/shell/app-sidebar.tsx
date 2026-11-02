import { Button } from "@ckpro/ui/components/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@ckpro/ui/components/context-menu";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Input } from "@ckpro/ui/components/input";
import { Sidebar, SidebarEye, SidebarGrip, SidebarItem } from "@ckpro/ui/components/sidebar";
import { useDragOrder } from "@ckpro/ui/hooks/use-drag-order";
import { cn } from "@ckpro/ui/lib/utils";
import { PanelLeft, Search, Settings } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ExamList } from "@/components/catalog/exam-list";
import { moved, toggled } from "@/components/catalog/layout";
import { SHORTCUTS } from "@/shortcuts";
import { useAssistantEnabled, useSidebarLayout } from "@/stores/settings";
import { arrangeScreens } from "./sections";
import { SidebarMenu } from "./sidebar-menu";

/**
 * The app's sidebar: its screens, the exams, Settings. It is arranged in
 * place: right-click, Edit Sidebar, and its rows stay as they are, each
 * with a grip added to drag it into order, screens and certifications an
 * eye to hide them (hidden ones stay listed, dimmed, to be shown again),
 * the candidate's exams a red minus to delete them, until Done (or
 * Escape). Out of editing nothing drags: a click opens. `searching`: a field that narrows the exams to
 * those whose title has what is typed
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
	const [editing, setEditing] = useState(false);
	const edit = () => {
		stopSearching();
		setEditing(true);
	};
	const assistant = useAssistantEnabled();
	const screens = arrangeScreens(layout, { withHidden: editing, assistant });
	const dragScreen = useDragOrder("sidebar-screens", (path, target, after) =>
		setLayout({
			screens: moved(
				arrangeScreens(layout, { withHidden: true }).map(s => s.path),
				path,
				target,
				after
			),
		})
	);
	function stopSearching() {
		setQuery("");
		onSearching(false);
	}

	return (
		// A right-click on a row opens the row's menu; anywhere else, this one
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<Sidebar
					aria-label="Sidebar"
					inert={folded}
					onKeyDown={e => editing && e.key === "Escape" && setEditing(false)}
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
						{editing ? (
							<Button size="push" variant="push" onClick={() => setEditing(false)}>
								Done
							</Button>
						) : (
							<>
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
									aria-label={`Hide sidebar (${SHORTCUTS.sidebar.label})`}
									onClick={onFold}
								>
									<PanelLeft />
								</IconButton>
							</>
						)}
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
					{/* A row dragged near the top or the bottom scrolls the list: a long
					    one is ordered without dropping and dragging again */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: only a drag scrolls it; its rows take clicks and keys */}
					<div
						className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
						onDragOver={e => {
							const r = e.currentTarget.getBoundingClientRect();
							const by = e.clientY < r.top + 40 ? -12 : e.clientY > r.bottom - 40 ? 12 : 0;
							if (by) e.currentTarget.scrollBy({ top: by });
						}}
					>
						{!searching &&
							screens.map(({ path, label, icon: Icon }) => {
								const hidden = layout.hidden_screens.includes(path);
								return (
									<ContextMenu key={path}>
										<ContextMenuTrigger asChild>
											<SidebarItem
												icon={<Icon />}
												label={label}
												current={pathname === path}
												onClick={() => navigate(path)}
												// Edited: the same row, its eye (not Home, which is
												// always there) and grip added
												trailing={
													editing ? (
														<>
															{path !== "/" && (
																<SidebarEye
																	hidden={hidden}
																	name={label}
																	onToggle={() =>
																		setLayout({
																			hidden_screens: toggled(layout.hidden_screens, path, !hidden),
																		})
																	}
																/>
															)}
															<SidebarGrip />
														</>
													) : undefined
												}
												className={cn(
													editing && dragScreen.landing(path),
													editing && hidden && "opacity-40"
												)}
												{...(editing ? dragScreen.row(path) : {})}
											/>
										</ContextMenuTrigger>
										<ContextMenuContent>
											<ContextMenuItem onSelect={() => navigate(path)}>Open</ContextMenuItem>
											<ContextMenuSeparator />
											<ContextMenuItem onSelect={edit}>Edit Sidebar…</ContextMenuItem>
										</ContextMenuContent>
									</ContextMenu>
								);
							})}
						<ExamList query={searching ? query : ""} editing={editing} onEdit={edit} />
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
			<SidebarMenu onEdit={edit} />
		</ContextMenu>
	);
}
