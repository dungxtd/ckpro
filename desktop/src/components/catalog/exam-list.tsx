import { ConfirmDialog } from "@ckdry/ui/components/confirm-dialog";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@ckdry/ui/components/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
} from "@ckdry/ui/components/dropdown-menu";
import { SidebarGroupToggle, SidebarItem, SidebarLabel } from "@ckdry/ui/components/sidebar";
import { useDragOrder } from "@ckdry/ui/hooks/use-drag-order";
import { cn } from "@ckdry/ui/lib/utils";
import { Pin } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled, useSidebarLayout } from "@/stores/settings";
import { type ExamSort, type ExamSummary, errorText, examApi } from "@/tauri/api";
import { memoryFit, shortTitle, useExamStats, useSelection } from "./exams";
import { arrange, moved, pinned, SORTS, stepped, toggled } from "./layout";

/** Docker's memory when it is up */
const useDockerMb = () =>
	useEnvironment(s => (s.env?.docker.state === "up" ? s.env.docker.memory_mb : null));

/** The exams, for the sidebar: read once the app opens, whatever screen is
 * shown; their last attempts read again whenever one is over */
function useCatalog() {
	const catalog = useExam(s => s.catalog);
	const loadCatalog = useExam(s => s.loadCatalog);
	const idle = useExam(s => !s.state || s.state.phase === "idle");
	useEffect(() => {
		if (useExam.getState().catalog.length === 0) loadCatalog();
	}, [loadCatalog]);
	useEffect(() => {
		if (idle) useExamStats.getState().load();
	}, [idle]);
	return catalog;
}

/**
 * The exams in the sidebar: the pinned ones first, then by certification,
 * and the question generator after them. Everything is dragged straight
 * into another order (exams within their certification, or among the
 * pinned), or moved with ⌥⌘↑ and ⌥⌘↓. A certification folds from its name;
 * its right-click menu sorts it (by hand, by recent practice, lowest score
 * first, by name) or hides it, an exam's pins it or deletes the
 * candidate's own. `query` keeps the exams whose title has it
 */
export function ExamList({ query }: { query: string }) {
	const catalog = useCatalog();
	const loadCatalog = useExam(s => s.loadCatalog);
	const stats = useExamStats(s => s.stats);
	const dockerMb = useDockerMb();
	const assistant = useAssistantEnabled();
	const [layout, setLayout] = useSidebarLayout();
	const { exam: shown, generating, select, generate } = useSelection();
	const navigate = useNavigate();
	const onExams = useLocation().pathname === "/";
	const [deleting, setDeleting] = useState<ExamSummary | null>(null);
	const q = query.trim().toLowerCase();
	const matches = (e: ExamSummary) => e.title.toLowerCase().includes(q);

	const all = arrange(catalog, layout, true, stats);
	const top = pinned(catalog, layout).filter(matches);
	const groups = arrange(catalog, layout, false, stats)
		.map(g => ({ ...g, exams: g.exams.filter(matches) }))
		.filter(g => !q || g.exams.length > 0);
	const certOf = new Map(catalog.map(e => [e.id, e.certification]));
	// Exams as listed: moving one keeps what is shown, sorted by hand from then on
	const listed = all.flatMap(g => g.exams.map(e => e.id));
	const reorder = (next: string[], cert: string) =>
		setLayout({ exams: next, sort: { ...layout.sort, [cert]: "manual" } });

	const dragGroup = useDragOrder("sidebar-groups", (cert, target, after) =>
		setLayout({
			groups: moved(
				all.map(g => g.cert),
				cert,
				target,
				after
			),
		})
	);
	const dragExam = useDragOrder(
		"sidebar-exams",
		(id, target, after) => reorder(moved(listed, id, target, after), certOf.get(id) ?? ""),
		(id, target) => certOf.get(id) === certOf.get(target)
	);
	const dragPinned = useDragOrder("sidebar-pinned", (id, target, after) =>
		setLayout({ pinned: moved(layout.pinned, id, target, after) })
	);

	// ⌥⌘↑ and ⌥⌘↓ move the exam shown, among the pinned or in its certification
	useEffect(() => {
		const keys = (e: KeyboardEvent) => {
			if (!e.altKey || !e.metaKey || !shown || !onExams) return;
			const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
			if (!by) return;
			e.preventDefault();
			if (layout.pinned.includes(shown.id)) {
				setLayout({ pinned: stepped(layout.pinned, shown.id, by) });
				return;
			}
			const mine = listed.filter(id => certOf.get(id) === shown.certification);
			const next = mine[mine.indexOf(shown.id) + by];
			if (next) reorder(moved(listed, shown.id, next, by === 1), shown.certification);
		};
		window.addEventListener("keydown", keys);
		return () => window.removeEventListener("keydown", keys);
	});

	const remove = async (exam: ExamSummary) => {
		try {
			await examApi.delete(exam.id);
			setLayout({ pinned: toggled(layout.pinned, exam.id, false) });
			if (shown?.id === exam.id) navigate("/");
			await loadCatalog();
			toast.success(`${exam.title} deleted`);
		} catch (e) {
			toast.error(errorText(e));
		}
	};

	/** One exam's row and its right-click menu; `drag`: the list it moves in */
	const row = (exam: ExamSummary, drag: ReturnType<typeof useDragOrder>, isPinned: boolean) => {
		const f = memoryFit(exam, dockerMb);
		return (
			<ContextMenu key={exam.id}>
				<ContextMenuTrigger asChild>
					<SidebarItem
						label={shortTitle(exam.title)}
						// Pinned, away from its certification's heading: it says which
						detail={`${isPinned ? `${exam.certification.toUpperCase()}, ` : ""}${exam.questions} questions, ${exam.duration_minutes} min${f === "slower" ? ", runs slower" : f === "too-small" ? ", needs more memory" : ""}`}
						warning={f === "slower" || f === "too-small"}
						current={onExams && !generating && shown?.id === exam.id}
						onClick={() => select(exam.id)}
						className={cn(drag.landing(exam.id))}
						{...drag.row(exam.id, !q)}
					/>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={() => select(exam.id)}>Open</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => setLayout({ pinned: toggled(layout.pinned, exam.id, !isPinned) })}
					>
						{isPinned ? "Unpin" : "Pin to Top"}
					</ContextMenuItem>
					{exam.custom && (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem className="text-destructive" onSelect={() => setDeleting(exam)}>
								Delete Exam…
							</ContextMenuItem>
						</>
					)}
				</ContextMenuContent>
			</ContextMenu>
		);
	};

	return (
		<>
			{top.length > 0 && (
				<>
					<SidebarLabel className="flex items-center gap-1">
						<Pin className="size-3" /> Pinned
					</SidebarLabel>
					{top.map(exam => row(exam, dragPinned, true))}
				</>
			)}
			{groups.map(({ cert, exams, collapsed, sort }) => {
				const open = !collapsed || !!q;
				return (
					<div key={cert}>
						<ContextMenu>
							<ContextMenuTrigger asChild>
								<SidebarGroupToggle
									label={cert.toUpperCase()}
									open={open}
									count={exams.length}
									onClick={() => setLayout({ collapsed: toggled(layout.collapsed, cert, open) })}
									className={cn(dragGroup.landing(cert))}
									{...dragGroup.row(cert, !q)}
								/>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem
									onSelect={() => setLayout({ collapsed: toggled(layout.collapsed, cert, open) })}
								>
									{open ? "Collapse" : "Expand"}
								</ContextMenuItem>
								<ContextMenuSub>
									<ContextMenuSubTrigger value={SORTS.find(s => s.value === sort)?.label}>
										Sort By
									</ContextMenuSubTrigger>
									<ContextMenuSubContent>
										<ContextMenuRadioGroup
											value={sort}
											onValueChange={value =>
												setLayout({ sort: { ...layout.sort, [cert]: value as ExamSort } })
											}
										>
											{SORTS.map(s => (
												<ContextMenuRadioItem key={s.value} value={s.value}>
													{s.label}
												</ContextMenuRadioItem>
											))}
										</ContextMenuRadioGroup>
									</ContextMenuSubContent>
								</ContextMenuSub>
								<ContextMenuSeparator />
								<ContextMenuItem
									onSelect={() => setLayout({ hidden: toggled(layout.hidden, cert, true) })}
								>
									Hide {cert.toUpperCase()}
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
						{open && exams.map(exam => row(exam, dragExam, false))}
					</div>
				);
			})}
			{q && top.length === 0 && groups.length === 0 && (
				<p className="px-2.5 pt-3 text-2xs text-muted-foreground">No exam has “{query.trim()}”.</p>
			)}
			{assistant && !q && (
				<>
					<SidebarLabel>Features</SidebarLabel>
					<SidebarItem
						icon={<ClaudeIcon className="text-claude!" />}
						label="Generate a question"
						current={onExams && generating}
						onClick={generate}
					/>
				</>
			)}
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={o => !o && setDeleting(null)}
				title={`Delete ${deleting?.title ?? "this exam"}?`}
				description="Its questions are deleted with it, from this Mac. Past attempts stay in History."
				action="Delete"
				onConfirm={() => deleting && remove(deleting)}
			/>
		</>
	);
}

/** The same, as a menu: the capsule's Exams, when the sidebar is folded */
export function ExamMenuItems() {
	const catalog = useCatalog();
	const stats = useExamStats(s => s.stats);
	const assistant = useAssistantEnabled();
	const [layout] = useSidebarLayout();
	const { exam: shown, generating, select, generate } = useSelection();
	const onExams = useLocation().pathname === "/";
	const top = pinned(catalog, layout);
	return (
		<>
			<DropdownMenuRadioGroup
				value={onExams && !generating ? (shown?.id ?? "") : ""}
				onValueChange={select}
			>
				{top.length > 0 && (
					<>
						<DropdownMenuLabel>Pinned</DropdownMenuLabel>
						{top.map(exam => (
							<DropdownMenuRadioItem key={exam.id} value={exam.id}>
								{exam.certification.toUpperCase()} {shortTitle(exam.title)}
							</DropdownMenuRadioItem>
						))}
					</>
				)}
				{arrange(catalog, layout, false, stats).map(({ cert, exams }) => (
					<Fragment key={cert}>
						<DropdownMenuLabel>{cert.toUpperCase()}</DropdownMenuLabel>
						{exams.map(exam => (
							<DropdownMenuRadioItem key={exam.id} value={exam.id}>
								{shortTitle(exam.title)}
							</DropdownMenuRadioItem>
						))}
					</Fragment>
				))}
			</DropdownMenuRadioGroup>
			{assistant && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={generate}>
						<ClaudeIcon className="text-claude" />
						Generate a question
					</DropdownMenuItem>
				</>
			)}
		</>
	);
}
