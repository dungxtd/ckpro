import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
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
} from "@ckpro/ui/components/context-menu";
import {
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@ckpro/ui/components/dropdown-menu";
import {
	SidebarEye,
	SidebarGrip,
	SidebarGroupToggle,
	SidebarItem,
	SidebarLabel,
	SidebarRemove,
} from "@ckpro/ui/components/sidebar";
import { useDragOrder } from "@ckpro/ui/hooks/use-drag-order";
import { cn } from "@ckpro/ui/lib/utils";
import { Pin } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { SHORTCUTS } from "@/shortcuts";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useSettings, useSidebarLayout } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import { type ExamSort, type ExamSummary, errorText, examApi } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { plural } from "@/words";
import { memoryFit, useSelection } from "./exams";
import { arrange, moved, pinned, SORTS, stepped, toggled } from "./layout";

/** Docker's memory when it is up */
const useDockerMb = () =>
	useEnvironment(s => (s.env?.docker.state === "up" ? s.env.docker.memory_mb : null));

/** The exams, for the sidebar: read once the app opens, whatever screen is
 * shown; their last attempts read again whenever one is over */
function useCatalog() {
	const catalog = useExam(s => s.catalog);
	const loadCatalog = useExam(s => s.loadCatalog);
	useEffect(() => {
		if (useExam.getState().catalog.length === 0) loadCatalog();
	}, [loadCatalog]);
	return catalog;
}

/**
 * The exams in the sidebar: the pinned ones first, then by certification,
 * and the question generator after them. A certification folds from its
 * name; its right-click menu sorts it (by hand, by recent practice, lowest
 * score first, by name), an exam's pins it or deletes the candidate's own;
 * both open the sidebar's editing. While `editing`, the rows stay as they
 * are (certifications still fold, which keeps a long list short) and gain a
 * grip to drag them into order (exams within their certification, or among
 * the pinned), a certification an eye to hide it (hidden ones then show,
 * dimmed), a candidate's exam a red minus to delete it. Move to Top and
 * Bottom, and ⌥⌘↑ and ⌥⌘↓ (Ctrl+Alt+↑↓), move an exam without dragging. `query` keeps
 * the exams whose title has it
 */
export function ExamList({
	query,
	editing,
	onEdit,
}: {
	query: string;
	editing: boolean;
	onEdit: () => void;
}) {
	const catalog = useCatalog();
	const loadCatalog = useExam(s => s.loadCatalog);
	const stats = useStudy(s => s.byExam);
	const dockerMb = useDockerMb();
	const [layout, setLayout] = useSidebarLayout();
	const { exam: shown, select } = useSelection();
	const navigate = useNavigate();
	const here = useLocation();
	const onExams = here.pathname === "/exams";
	const [deleting, setDeleting] = useState<ExamSummary | null>(null);
	const q = query.trim().toLowerCase();
	const matches = (e: ExamSummary) => e.title.toLowerCase().includes(q);

	const all = arrange(catalog, layout, true, stats);
	const top = pinned(catalog, layout).filter(matches);
	const groups = arrange(catalog, layout, editing, stats)
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

	// ⌥⌘↑ and ⌥⌘↓ (Ctrl+Alt+↑↓) move the exam shown, among the pinned or in its certification
	useEffect(() => {
		const keys = (e: KeyboardEvent) => {
			if (!shown || !onExams) return;
			const by = SHORTCUTS.moveUp.is(e) ? -1 : SHORTCUTS.moveDown.is(e) ? 1 : 0;
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
			// It, and the custom exams that used its questions
			// Rust takes them out of the sidebar's layout too: read it again
			const gone = await examApi.delete(exam.id);
			await useSettings.getState().load();
			// The one shown went: the list's first instead (none picked)
			const picked = new URLSearchParams(here.search).get("exam");
			if (onExams && picked && gone.includes(picked)) navigate("/exams");
			await loadCatalog();
			toast.success(`Deleted ${shortTitle(exam.title)}`, {
				description:
					gone.length > 1
						? `and ${plural(gone.length - 1, "exam")} using its questions`
						: undefined,
			});
		} catch (e) {
			toast.error(errorText(e));
		}
	};

	/** One exam's row and its right-click menu; `drag`: the list it moves in */
	const row = (exam: ExamSummary, drag: ReturnType<typeof useDragOrder>, isPinned: boolean) => {
		const f = memoryFit(exam, dockerMb);
		const name = shortTitle(exam.title);
		// Its certification's own: move it to either end of it, in one go
		const ends = () => listed.filter(id => certOf.get(id) === exam.certification);
		const toEnd = (last: boolean) => {
			const mine = ends();
			const target = last ? mine.at(-1) : mine[0];
			if (target) reorder(moved(listed, exam.id, target, last), exam.certification);
		};
		return (
			<ContextMenu key={exam.id}>
				<ContextMenuTrigger asChild>
					<SidebarItem
						label={name}
						// Pinned, away from its certification's heading: it says which
						detail={`${isPinned ? `${exam.certification.toUpperCase()}, ` : ""}${exam.questions} questions, ${exam.duration_minutes} min${f === "slower" ? ", runs slower" : f === "too-small" ? ", needs more memory" : ""}`}
						warning={f === "slower" || f === "too-small"}
						current={onExams && shown?.id === exam.id}
						onClick={() => select(exam.id)}
						// Edited: the same row, a red minus (its own) and its grip added
						leading={
							editing && exam.custom ? (
								<SidebarRemove name={name} onRemove={() => setDeleting(exam)} />
							) : undefined
						}
						trailing={editing ? <SidebarGrip /> : undefined}
						className={cn(
							editing && drag.landing(exam.id),
							editing && !isPinned && layout.hidden.includes(exam.certification) && "opacity-40"
						)}
						{...(editing ? drag.row(exam.id) : {})}
					/>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={() => select(exam.id)}>Open</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => setLayout({ pinned: toggled(layout.pinned, exam.id, !isPinned) })}
					>
						{isPinned ? "Unpin" : "Pin to Top"}
					</ContextMenuItem>
					{!isPinned && (
						<>
							<ContextMenuItem onSelect={() => toEnd(false)}>Move to Top</ContextMenuItem>
							<ContextMenuItem onSelect={() => toEnd(true)}>Move to Bottom</ContextMenuItem>
						</>
					)}
					{exam.custom && (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem className="text-destructive" onSelect={() => setDeleting(exam)}>
								Delete Exam…
							</ContextMenuItem>
						</>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={onEdit}>Edit Sidebar…</ContextMenuItem>
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
				const hidden = layout.hidden.includes(cert);
				return (
					<div key={cert}>
						<ContextMenu>
							<ContextMenuTrigger asChild>
								<SidebarGroupToggle
									label={cert.toUpperCase()}
									open={open}
									count={exams.length}
									onToggle={() => setLayout({ collapsed: toggled(layout.collapsed, cert, open) })}
									// Edited: the same heading (it still folds), its eye and grip added
									trailing={
										editing ? (
											<>
												<SidebarEye
													hidden={hidden}
													name={cert.toUpperCase()}
													onToggle={() =>
														setLayout({ hidden: toggled(layout.hidden, cert, !hidden) })
													}
												/>
												<SidebarGrip />
											</>
										) : undefined
									}
									className={cn(
										editing && "cursor-grab active:cursor-grabbing",
										editing && dragGroup.landing(cert),
										editing && hidden && "opacity-40"
									)}
									{...(editing ? dragGroup.row(cert) : {})}
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
								<ContextMenuItem onSelect={onEdit}>Edit Sidebar…</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
						{open && exams.map(exam => row(exam, dragExam, false))}
					</div>
				);
			})}
			{q && top.length === 0 && groups.length === 0 && (
				<p className="px-2.5 pt-3 text-2xs text-muted-foreground">No exam has “{query.trim()}”.</p>
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
	const stats = useStudy(s => s.byExam);
	const [layout] = useSidebarLayout();
	const { exam: shown, select } = useSelection();
	const onExams = useLocation().pathname === "/exams";
	const top = pinned(catalog, layout);
	return (
		<DropdownMenuRadioGroup value={onExams ? (shown?.id ?? "") : ""} onValueChange={select}>
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
	);
}
