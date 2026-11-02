import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { ConfirmDialog } from "@ckdry/ui/components/confirm-dialog";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import { Separator } from "@ckdry/ui/components/separator";
import { mac } from "@ckdry/ui/lib/platform";
import { cn } from "@ckdry/ui/lib/utils";
import { BookOpen, Flag, LogOut, Monitor, PanelRight, X } from "lucide-react";
import { DesktopMenu, type DesktopMenuProps } from "@/components/exam/desktop-menu";
import { Timer } from "@/components/exam/timer";
import { WindowControls } from "@/components/shell/window-controls";
import type { Attempt } from "@/tauri/api";

export type DeskView = "desktop" | "readme";

/**
 * The exam desk's top bar. Left: time, the exam and its mode. Right: what is
 * shown (the desktop or its Readme) and the desktop's menu (size, resolution,
 * reset), then the attempt's own controls: in practice Quit and Finish,
 * and the assistant's side panel button outermost; in an exam only End
 * Exam, as on the real one.
 */
export function TopBar({
	attempt,
	startedAt,
	endsAt,
	view,
	onView,
	desktop,
	assistantOpen,
	assistantAvailable,
	onAssistant,
	onFinish,
	onQuit,
}: {
	attempt: Attempt;
	startedAt: number | null;
	endsAt: number | null;
	view: DeskView;
	onView: (view: DeskView) => void;
	desktop: DesktopMenuProps;
	assistantOpen: boolean;
	/** Practice, with the assistant turned on in Settings */
	assistantAvailable: boolean;
	onAssistant: (open: boolean) => void;
	/** Grade every task (End Exam, Finish) */
	onFinish: () => void;
	/** Practice: leave without grading */
	onQuit: () => void;
}) {
	const practice = attempt.mode === "practice";
	return (
		// Labels give way to icons as the window narrows (container queries);
		// it moves the window, and has the window's buttons: macOS's float at
		// its start, Windows' are drawn at its end
		<header
			data-tauri-drag-region
			className={cn(
				"@container flex h-12 shrink-0 select-none items-center gap-3 border-border border-b pr-3",
				mac ? "pl-20" : "pl-3"
			)}
		>
			<Timer startedAt={startedAt} endsAt={endsAt} />
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<strong className="min-w-0 truncate text-lead">{attempt.title}</strong>
				<Badge variant={practice ? "subtle" : "destructive"} className="shrink-0">
					{practice ? "Practice" : "Exam"}
				</Badge>
			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				<SegmentedControl
					label="View"
					value={view}
					onChange={onView}
					options={[
						{ value: "desktop", label: <ViewLabel icon={Monitor} text="Desktop" /> },
						{ value: "readme", label: <ViewLabel icon={BookOpen} text="Readme" /> },
					]}
				/>
				<DesktopMenu {...desktop} />
			</div>

			<Separator orientation="vertical" className="h-5 self-center" />

			<div className="flex shrink-0 items-center gap-1.5">
				{practice && (
					<ConfirmDialog
						cancel="Keep Working"
						title="Quit the practice?"
						description="Your work is not graded and its clusters are removed. You cannot come back to it."
						action="Quit"
						onConfirm={onQuit}
					>
						<Button size="push" variant="push">
							<LogOut /> <span className="sr-only @2xl:not-sr-only">Quit</span>
						</Button>
					</ConfirmDialog>
				)}
				<ConfirmDialog
					cancel="Keep Working"
					title={practice ? "Finish the practice?" : "End the exam?"}
					description="Your work is graded now and the environment is removed. You cannot come back to it."
					action={practice ? "Finish" : "End exam"}
					onConfirm={onFinish}
				>
					{practice ? (
						<Button size="push" variant="pushDefault">
							<Flag /> <span className="sr-only @2xl:not-sr-only">Finish</span>
						</Button>
					) : (
						<Button size="push" variant="outlineDestructive">
							<X /> <span className="sr-only @2xl:not-sr-only">End Exam</span>
						</Button>
					)}
				</ConfirmDialog>
			</div>

			{assistantAvailable && (
				<>
					<Separator orientation="vertical" className="h-5 self-center" />
					{/* Outermost, like a browser's side panel button: the assistant opens at this edge */}
					<IconButton
						variant="plain"
						size="bar"
						active={assistantOpen}
						aria-pressed={assistantOpen}
						aria-label={assistantOpen ? "Hide assistant" : "Show assistant"}
						onClick={() => onAssistant(!assistantOpen)}
					>
						<PanelRight />
					</IconButton>
				</>
			)}
			{!mac && <WindowControls />}
		</header>
	);
}

/** A view's icon, with its name once the bar has room (always for screen readers) */
function ViewLabel({ icon: Icon, text }: { icon: typeof Monitor; text: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<Icon className="size-3.5" />
			<span className="sr-only @4xl:not-sr-only">{text}</span>
		</span>
	);
}
