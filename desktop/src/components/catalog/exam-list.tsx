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
import { useDragOrder } from "@ckdry/ui/hooks/use-drag-order";
import { cn } from "@ckdry/ui/lib/utils";
import { Fragment, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled, useSidebarLayout } from "@/stores/settings";
import { type ExamSummary, errorText, examApi } from "@/tauri/api";
import { memoryFit, shortTitle, useSelection } from "./exams";
import { arrange, moved, toggled } from "./layout";

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

/**
 * The exams in the sidebar, by certification, and the question generator
 * after them. A certification folds away from its name; exams (within
 * their certification) and certifications are dragged into another order.
 * The right-click menu hides a certification and deletes the candidate's
 * own exams. `query` keeps the exams whose title has it
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
	const [deleting, setDeleting] = useState<ExamSummary | null>(null);
	const q = query.trim().toLowerCase();

	const all = arrange(catalog, layout, true);
	const groups = arrange(catalog, layout)
		.map(g => ({ ...g, exams: g.exams.filter(e => e.title.toLowerCase().includes(q)) }))
		.filter(g => !q || g.exams.length > 0);
	const certOf = new Map(catalog.map(e => [e.id, e.certification]));
	// Certifications among themselves; exams within their certification
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
		(id, target, after) =>
			setLayout({
				exams: moved(
					all.flatMap(g => g.exams.map(e => e.id)),
					id,
					target,
					after
				),
			}),
		(id, target) => certOf.get(id) === certOf.get(target)
	);

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
			{groups.map(({ cert, exams, collapsed }) => {
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
								<ContextMenuItem
									onSelect={() => setLayout({ hidden: toggled(layout.hidden, cert, true) })}
								>
									Hide {cert.toUpperCase()}
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
						{open &&
							exams.map(exam => {
								const f = memoryFit(exam, dockerMb);
								return (
									<ContextMenu key={exam.id}>
										<ContextMenuTrigger asChild>
											<SidebarItem
												label={shortTitle(exam.title)}
												detail={`${exam.questions} questions, ${exam.duration_minutes} min${f === "slower" ? ", runs slower" : f === "too-small" ? ", needs more memory" : ""}`}
												warning={f === "slower" || f === "too-small"}
												current={onExams && !generating && shown?.id === exam.id}
												onClick={() => select(exam.id)}
												className={cn(dragExam.landing(exam.id))}
												{...dragExam.row(exam.id, !q)}
											/>
										</ContextMenuTrigger>
										<ContextMenuContent>
											<ContextMenuItem onSelect={() => select(exam.id)}>Open</ContextMenuItem>
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
