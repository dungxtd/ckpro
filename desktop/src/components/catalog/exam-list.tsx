import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
} from "@ckdry/ui/components/dropdown-menu";
import { SidebarItem, SidebarLabel } from "@ckdry/ui/components/sidebar";
import { Fragment, useEffect } from "react";
import { useLocation } from "react-router";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import { useEnvironment } from "@/stores/environment";
import { useExam } from "@/stores/exam";
import { useAssistantEnabled } from "@/stores/settings";
import { byCertification, memoryFit, shortTitle, useSelection } from "./exams";

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
 * after them. `query` keeps the exams whose title has it
 */
export function ExamList({ query }: { query: string }) {
	const catalog = useCatalog();
	const dockerMb = useDockerMb();
	const assistant = useAssistantEnabled();
	const { exam: shown, generating, select, generate } = useSelection();
	const onExams = useLocation().pathname === "/";
	const q = query.trim().toLowerCase();
	const groups = byCertification(catalog.filter(e => e.title.toLowerCase().includes(q)));

	return (
		<>
			{groups.map(([cert, exams]) => (
				<Fragment key={cert}>
					<SidebarLabel>{cert.toUpperCase()}</SidebarLabel>
					{exams.map(exam => {
						const f = memoryFit(exam, dockerMb);
						return (
							<SidebarItem
								key={exam.id}
								label={shortTitle(exam)}
								detail={`${exam.questions} questions, ${exam.duration_minutes} min${f === "slower" ? ", runs slower" : f === "too-small" ? ", needs more memory" : ""}`}
								warning={f === "slower" || f === "too-small"}
								current={onExams && !generating && shown?.id === exam.id}
								onClick={() => select(exam.id)}
							/>
						);
					})}
				</Fragment>
			))}
			{q && groups.length === 0 && (
				<p className="px-2.5 pt-3 text-2xs text-muted-foreground">No exam has “{query.trim()}”.</p>
			)}
			{assistant && !q && (
				<>
					<SidebarLabel>Yours</SidebarLabel>
					<SidebarItem
						icon={<ClaudeIcon className="text-claude!" />}
						label="Generate a question"
						current={onExams && generating}
						onClick={generate}
					/>
				</>
			)}
		</>
	);
}

/** The same, as a menu: the capsule's Exams, when the sidebar is folded */
export function ExamMenuItems() {
	const catalog = useCatalog();
	const assistant = useAssistantEnabled();
	const { exam: shown, generating, select, generate } = useSelection();
	const onExams = useLocation().pathname === "/";
	return (
		<>
			<DropdownMenuRadioGroup
				value={onExams && !generating ? (shown?.id ?? "") : ""}
				onValueChange={select}
			>
				{byCertification(catalog).map(([cert, exams]) => (
					<Fragment key={cert}>
						<DropdownMenuLabel>{cert.toUpperCase()}</DropdownMenuLabel>
						{exams.map(exam => (
							<DropdownMenuRadioItem key={exam.id} value={exam.id}>
								{shortTitle(exam)}
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
