import {
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@ckdry/ui/components/context-menu";
import { arrange, SORTS, toggled } from "@/components/catalog/layout";
import { useExam } from "@/stores/exam";
import { useSidebarLayout } from "@/stores/settings";
import type { ExamSort } from "@/tauri/api";
import { SECTIONS } from "./sections";

/**
 * The sidebar's own menu, from a right-click where it has no row (as
 * macOS toolbars and sidebars have): what it shows, checked on or off (a
 * screen or a certification), how every certification sorts its exams, and
 * its order put back. A row's own menu is about that row
 */
export function SidebarMenu() {
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
			<ContextMenuLabel>Show in Sidebar</ContextMenuLabel>
			{SECTIONS.filter(s => s.path !== "/").map(s => (
				<ContextMenuCheckboxItem
					key={s.path}
					checked={!layout.hidden_screens.includes(s.path)}
					onCheckedChange={on =>
						setLayout({ hidden_screens: toggled(layout.hidden_screens, s.path, !on) })
					}
					onSelect={e => e.preventDefault()}
				>
					{s.label}
				</ContextMenuCheckboxItem>
			))}
			{certs.map(cert => (
				<ContextMenuCheckboxItem
					key={cert}
					checked={!layout.hidden.includes(cert)}
					onCheckedChange={on => setLayout({ hidden: toggled(layout.hidden, cert, !on) })}
					onSelect={e => e.preventDefault()}
				>
					{cert.toUpperCase()}
				</ContextMenuCheckboxItem>
			))}
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
