import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@cktry/ui/components/context-menu";
import { arrange, SORTS } from "@/components/catalog/layout";
import { useExam } from "@/stores/exam";
import { useSidebarLayout } from "@/stores/settings";
import type { ExamSort } from "@/tauri/api";

/**
 * The sidebar's own menu, from a right-click where it has no row (as
 * macOS toolbars and sidebars have): edit it (order, hide, delete, in
 * place), sort every certification's exams one way, or put its order back.
 * A row's own menu is about that row
 */
export function SidebarMenu({ onEdit }: { onEdit: () => void }) {
	const catalog = useExam(s => s.catalog);
	const [layout, setLayout] = useSidebarLayout();
	const certs = arrange(catalog, layout, true).map(g => g.cert);
	const sorts = new Set(certs.map(c => layout.sort[c] ?? "manual"));
	// One sort for all of them, or none checked when they differ
	const sort = sorts.size === 1 ? [...sorts][0] : "";
	const arranged =
		layout.screens.length +
			layout.groups.length +
			layout.exams.length +
			layout.collapsed.length +
			layout.pinned.length >
		0;
	return (
		<ContextMenuContent>
			<ContextMenuItem onSelect={onEdit}>Edit Sidebar…</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuSub>
				<ContextMenuSubTrigger value={SORTS.find(s => s.value === sort)?.label}>
					Sort Exams By
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					<ContextMenuRadioGroup
						value={sort}
						onValueChange={value =>
							setLayout({ sort: Object.fromEntries(certs.map(c => [c, value as ExamSort])) })
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
			<ContextMenuItem
				disabled={!arranged}
				onSelect={() =>
					setLayout({ screens: [], groups: [], exams: [], collapsed: [], pinned: [], sort: {} })
				}
			>
				Reset Order
			</ContextMenuItem>
		</ContextMenuContent>
	);
}
