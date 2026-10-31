import { IconButton } from "@ckdry/ui/components/icon-button";
import { Input } from "@ckdry/ui/components/input";
import { Sidebar, SidebarItem } from "@ckdry/ui/components/sidebar";
import { cn } from "@ckdry/ui/lib/utils";
import { PanelLeft, Search, Settings } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ExamList } from "@/components/catalog/exam-list";
import { SECTIONS } from "./sections";

/**
 * The app's sidebar: its screens, the exams, Settings. `searching`: a field
 * that narrows the exams to those whose title has what is typed
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
	const stopSearching = () => {
		setQuery("");
		onSearching(false);
	};

	return (
		<Sidebar
			aria-label="Sidebar"
			inert={folded}
			className={cn(
				"h-[calc(100%-1rem)] transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
				folded && "-translate-x-6 opacity-0"
			)}
		>
			{/* Beside the window's buttons (centred on the same line as the title
			    bars'); moves the window */}
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
				<IconButton variant="toolbar" size="bar" aria-label="Hide sidebar (⌃⌘S)" onClick={onFold}>
					<PanelLeft />
				</IconButton>
			</div>
			{searching && (
				<div className="px-2 pb-1">
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
					SECTIONS.map(({ path, label, icon: Icon }) => (
						<SidebarItem
							key={path}
							icon={<Icon />}
							label={label}
							current={pathname === path}
							onClick={() => navigate(path)}
						/>
					))}
				<ExamList query={searching ? query : ""} />
			</div>
			<div className="border-border border-t p-2">
				<SidebarItem
					icon={<Settings />}
					label="Settings"
					current={pathname === "/settings"}
					onClick={() => navigate("/settings")}
				/>
			</div>
		</Sidebar>
	);
}
