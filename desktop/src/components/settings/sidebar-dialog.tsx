import { Button } from "@ckdry/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@ckdry/ui/components/dialog";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Switch } from "@ckdry/ui/components/switch";
import { useDragOrder } from "@ckdry/ui/hooks/use-drag-order";
import { cn } from "@ckdry/ui/lib/utils";
import { GripHorizontal, RotateCcw, X } from "lucide-react";
import { arrange, moved, toggled } from "@/components/catalog/layout";
import { Group, Row } from "@/components/settings/layout";
import { arrangeScreens } from "@/components/shell/sections";
import { useExam } from "@/stores/exam";
import { useSidebarLayout } from "@/stores/settings";

/** A row's grip: what the row is dragged by */
const Grip = () => (
	<GripHorizontal aria-hidden className="size-4 cursor-grab text-muted-foreground" />
);

/**
 * What the sidebar lists, as macOS apps edit a tab bar: its screens and its
 * certifications, each dragged into order by its row and shown or hidden by
 * its switch. Exams, the home screen, always shows
 */
export function SidebarDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const catalog = useExam(s => s.catalog);
	const [layout, setLayout] = useSidebarLayout();
	const screens = arrangeScreens(layout, true);
	const groups = arrange(catalog, layout, true);
	const dragScreen = useDragOrder("settings-screens", (path, target, after) =>
		setLayout({
			screens: moved(
				screens.map(s => s.path),
				path,
				target,
				after
			),
		})
	);
	const dragGroup = useDragOrder("settings-groups", (cert, target, after) =>
		setLayout({
			groups: moved(
				groups.map(g => g.cert),
				cert,
				target,
				after
			),
		})
	);
	const arranged =
		layout.screens.length + layout.groups.length + layout.exams.length + layout.collapsed.length >
		0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				// Opened, the dialog itself has the focus, not its close button
				tabIndex={-1}
				onOpenAutoFocus={e => {
					e.preventDefault();
					(e.currentTarget as HTMLElement).focus();
				}}
				className="flex max-h-[min(720px,calc(100vh-4rem))] max-w-lg flex-col gap-0 p-0 outline-none"
			>
				<header className="grid shrink-0 grid-cols-[2rem_1fr_2rem] items-center px-4 py-3">
					<DialogClose asChild>
						<IconButton variant="toolbar" size="sm" aria-label="Close">
							<X />
						</IconButton>
					</DialogClose>
					<DialogTitle className="text-center font-semibold text-lead">Sidebar</DialogTitle>
					<DialogDescription className="sr-only">
						Drag the screens and the certifications into order; switch them on or off.
					</DialogDescription>
				</header>
				<div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-5 pt-2 pb-5">
					<Group title="Screens" description="Drag a row by its grip to move it.">
						{screens.map(({ path, label, icon: Icon }) => (
							<Row
								key={path}
								icon={<Icon />}
								label={label}
								className={cn(dragScreen.landing(path))}
								{...dragScreen.row(path)}
							>
								<div className="flex items-center gap-3">
									{path !== "/" && (
										<Switch
											aria-label={`Show ${label}`}
											checked={!layout.hidden_screens.includes(path)}
											onCheckedChange={on =>
												setLayout({ hidden_screens: toggled(layout.hidden_screens, path, !on) })
											}
										/>
									)}
									<Grip />
								</div>
							</Row>
						))}
					</Group>
					{groups.length > 0 && (
						<Group title="Certifications" description="Their exams show under them, folded or not.">
							{groups.map(({ cert, exams }) => (
								<Row
									key={cert}
									label={cert.toUpperCase()}
									detail={`${exams.length} exam${exams.length === 1 ? "" : "s"}`}
									className={cn(dragGroup.landing(cert))}
									{...dragGroup.row(cert)}
								>
									<div className="flex items-center gap-3">
										<Switch
											aria-label={`Show ${cert.toUpperCase()}`}
											checked={!layout.hidden.includes(cert)}
											onCheckedChange={on =>
												setLayout({ hidden: toggled(layout.hidden, cert, !on) })
											}
										/>
										<Grip />
									</div>
								</Row>
							))}
						</Group>
					)}
					<Button
						size="push"
						variant="push"
						className="self-center"
						disabled={!arranged}
						onClick={() => setLayout({ screens: [], groups: [], exams: [], collapsed: [] })}
					>
						<RotateCcw /> Reset order
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
