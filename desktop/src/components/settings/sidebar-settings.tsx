import { Button } from "@ckdry/ui/components/button";
import { Switch } from "@ckdry/ui/components/switch";
import { RotateCcw } from "lucide-react";
import { useSidebarLayout } from "@/components/catalog/exams";
import { arrange, toggled } from "@/components/catalog/layout";
import { Group, Row } from "@/components/settings/layout";
import { useExam } from "@/stores/exam";

/** Which certifications the sidebar lists, and its order back as it came */
export function SidebarSettings() {
	const catalog = useExam(s => s.catalog);
	const [layout, setLayout] = useSidebarLayout();
	const groups = arrange(catalog, layout, true);
	if (groups.length === 0) return null;
	const arranged = layout.groups.length + layout.exams.length + layout.collapsed.length > 0;
	return (
		<Group
			title="Sidebar"
			description="Drag exams and certifications in the sidebar to reorder them; right-click for more."
		>
			{groups.map(({ cert, exams }) => (
				<Row
					key={cert}
					label={`Show ${cert.toUpperCase()}`}
					detail={`${exams.length} exam${exams.length === 1 ? "" : "s"}`}
				>
					<Switch
						aria-label={`Show ${cert.toUpperCase()} in the sidebar`}
						checked={!layout.hidden.includes(cert)}
						onCheckedChange={on => setLayout({ hidden: toggled(layout.hidden, cert, !on) })}
					/>
				</Row>
			))}
			<Row label="Order" detail="As dragged, folded or not">
				<Button
					size="push"
					variant="push"
					disabled={!arranged}
					onClick={() => setLayout({ groups: [], exams: [], collapsed: [] })}
				>
					<RotateCcw /> Reset
				</Button>
			</Row>
		</Group>
	);
}
