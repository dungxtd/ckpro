import { ConfirmDialog } from "@ckdry/ui/components/confirm-dialog";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
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
import { cn } from "@ckdry/ui/lib/utils";
import { type DragEvent, Fragment, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled } from "@/stores/settings";
import { type ExamSummary, errorText, examApi } from "@/tauri/api";
import { memoryFit, shortTitle, useSelection, useSidebarLayout } from "./exams";
import { arrange, moved, stepped, toggled } from "./layout";

/** Docker's memory when it is up */
const useDockerMb = () =>
	useEnvironment(s => (s.env?.docker.state === "up" ? s.env.docker.memory_mb : null));

/** The exams, for the sidebar: read once the app opens, whatever screen is shown */
function useCatalog() {
	const catalog = useExam(s => s.catalog);
	const loadCatalog = useExam(s => s.loadCatalog);
	useEffect(() => {
		if (useExam.getState().catalog.length === 0) loadCatalog();
	}, [loadCatalog]);
	return catalog;
}

/** What is being dragged: an exam (within its certification) or a certification */
type Dragged = { kind: "exam"; id: string; cert: string } | { kind: "group"; cert: string };
/** Where it would land: before or after a row */
type Over = { key: string; after: boolean };

/** Before or after the row under the pointer: its upper or lower half */
const half = (e: DragEvent<HTMLElement>) => {
	const r = e.currentTarget.getBoundingClientRect();
	return e.clientY > r.top + r.height / 2;
};

/** The line where a dragged row would land, at the row's top or bottom */
const landing = (over: Over | null, key: string) =>
	over?.key === key &&
	(over.after
		? "shadow-[inset_0_-2px_0_var(--highlight)]"
		: "shadow-[inset_0_2px_0_var(--highlight)]");

/**
 * The exams in the sidebar, by certification, and the question generator
 * after them. A certification folds away from its name; exams and
 * certifications are dragged into another order, or moved from their
 * right-click menu, which also hides a certification and deletes the
 * candidate's own exams. `query` keeps the exams whose title has it
 */
export function ExamList({ query }: { query: string }) {
	const catalog = useCatalog();
	const loadCatalog = useExam(s => s.loadCatalog);
	const dockerMb = useDockerMb();
	const assistant = useAssistantEnabled();
	const [layout, setLayout] = useSidebarLayout();
	const { exam: shown, generating, select, generate } = useSelection();
	const navigate = useNavigate();
	const onExams = useLocation().pathname === "/";
	const dragged = useRef<Dragged | null>(null);
	const [over, setOver] = useState<Over | null>(null);
	const [deleting, setDeleting] = useState<ExamSummary | null>(null);
	const q = query.trim().toLowerCase();

	const all = arrange(catalog, layout, true);
	const groups = arrange(catalog, layout)
		.map(g => ({ ...g, exams: g.exams.filter(e => e.title.toLowerCase().includes(q)) }))
		.filter(g => !q || g.exams.length > 0);
	const groupOrder = all.map(g => g.cert);
	const examOrder = all.flatMap(g => g.exams.map(e => e.id));

	const moveGroup = (cert: string, by: -1 | 1) =>
		setLayout({ groups: stepped(groupOrder, cert, by) });
	const moveExam = (id: string, by: -1 | 1, cert: string) => {
		// Within its certification: the neighbour there, not across
		const inGroup = all.find(g => g.cert === cert)?.exams.map(e => e.id) ?? [];
		const next = inGroup[inGroup.indexOf(id) + by];
		if (next) setLayout({ exams: moved(examOrder, id, next, by === 1) });
	};
	const drop = (target: Dragged, after: boolean) => {
		const from = dragged.current;
		dragged.current = null;
		setOver(null);
		if (!from) return;
		if (from.kind === "group" && target.kind === "group")
			setLayout({ groups: moved(groupOrder, from.cert, target.cert, after) });
		if (from.kind === "exam" && target.kind === "exam" && from.cert === target.cert)
			setLayout({ exams: moved(examOrder, from.id, target.id, after) });
	};
	// A row takes a drop of its own kind (an exam: of its certification)
	const accepts = (target: Dragged) => {
		const from = dragged.current;
		return (
			from?.kind === target.kind &&
			(from.kind === "group" || (target.kind === "exam" && from.cert === target.cert))
		);
	};
	const dropTarget = (target: Dragged, key: string) => ({
		onDragOver: (e: DragEvent<HTMLElement>) => {
			if (!accepts(target)) return;
			e.preventDefault();
			const after = half(e);
			if (over?.key !== key || over.after !== after) setOver({ key, after });
		},
		onDrop: (e: DragEvent<HTMLElement>) => {
			e.preventDefault();
			drop(target, half(e));
		},
	});
	const dragSource = (what: Dragged) => ({
		draggable: !q,
		onDragStart: (e: DragEvent<HTMLElement>) => {
			dragged.current = what;
			e.dataTransfer.effectAllowed = "move";
		},
		onDragEnd: () => {
			dragged.current = null;
			setOver(null);
		},
	});

	const remove = async (exam: ExamSummary) => {
		try {
			await examApi.delete(exam.id);
			if (shown?.id === exam.id) navigate("/");
			await loadCatalog();
			toast.success(`${exam.title} deleted`);
		} catch (e) {
			toast.error(errorText(e));
		}
	};

	return (
		<>
			{groups.map(({ cert, exams, collapsed }, gi) => {
				const open = !collapsed || !!q;
				const group: Dragged = { kind: "group", cert };
				return (
					<div key={cert}>
						<ContextMenu>
							<ContextMenuTrigger asChild>
								<SidebarGroupToggle
									label={cert.toUpperCase()}
									open={open}
									count={exams.length}
									onClick={() => setLayout({ collapsed: toggled(layout.collapsed, cert, open) })}
									className={cn(landing(over, `group:${cert}`))}
									{...dragSource(group)}
									{...dropTarget(group, `group:${cert}`)}
								/>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem
									onSelect={() => setLayout({ collapsed: toggled(layout.collapsed, cert, open) })}
								>
									{open ? "Collapse" : "Expand"}
								</ContextMenuItem>
								<ContextMenuItem disabled={gi === 0} onSelect={() => moveGroup(cert, -1)}>
									Move up
								</ContextMenuItem>
								<ContextMenuItem
									disabled={gi === groups.length - 1}
									onSelect={() => moveGroup(cert, 1)}
								>
									Move down
								</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem
									onSelect={() => setLayout({ hidden: toggled(layout.hidden, cert, true) })}
								>
									Hide {cert.toUpperCase()}
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
						{open &&
							exams.map((exam, ei) => {
								const f = memoryFit(exam, dockerMb);
								const row: Dragged = { kind: "exam", id: exam.id, cert };
								return (
									<ContextMenu key={exam.id}>
										<ContextMenuTrigger asChild>
											<SidebarItem
												label={shortTitle(exam.title)}
												detail={`${exam.questions} questions, ${exam.duration_minutes} min${f === "slower" ? ", runs slower" : f === "too-small" ? ", needs more memory" : ""}`}
												warning={f === "slower" || f === "too-small"}
												current={onExams && !generating && shown?.id === exam.id}
												onClick={() => select(exam.id)}
												className={cn(landing(over, exam.id))}
												{...dragSource(row)}
												{...dropTarget(row, exam.id)}
											/>
										</ContextMenuTrigger>
										<ContextMenuContent>
											<ContextMenuItem onSelect={() => select(exam.id)}>Open</ContextMenuItem>
											<ContextMenuItem
												disabled={ei === 0}
												onSelect={() => moveExam(exam.id, -1, cert)}
											>
												Move up
											</ContextMenuItem>
											<ContextMenuItem
												disabled={ei === exams.length - 1}
												onSelect={() => moveExam(exam.id, 1, cert)}
											>
												Move down
											</ContextMenuItem>
											{exam.custom && (
												<>
													<ContextMenuSeparator />
													<ContextMenuItem
														className="text-destructive"
														onSelect={() => setDeleting(exam)}
													>
														Delete exam…
													</ContextMenuItem>
												</>
											)}
										</ContextMenuContent>
									</ContextMenu>
								);
							})}
					</div>
				);
			})}
			{q && groups.length === 0 && (
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
	const assistant = useAssistantEnabled();
	const [layout] = useSidebarLayout();
	const { exam: shown, generating, select, generate } = useSelection();
	const onExams = useLocation().pathname === "/";
	return (
		<>
			<DropdownMenuRadioGroup
				value={onExams && !generating ? (shown?.id ?? "") : ""}
				onValueChange={select}
			>
				{arrange(catalog, layout).map(({ cert, exams }) => (
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
