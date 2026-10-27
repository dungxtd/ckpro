import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ckdry/ui/components/alert-dialog";
import { Badge } from "@ckdry/ui/components/badge";
import { Button, buttonVariants } from "@ckdry/ui/components/button";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import { Separator } from "@ckdry/ui/components/separator";
import { BookOpen, Flag, Monitor, PanelRight, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Attempt } from "@/tauri/api";
import { DesktopMenu, type DesktopMenuProps } from "./desktop-menu";
import { Timer } from "./timer";

export type DeskView = "desktop" | "readme";

/**
 * The exam desk's top bar. Left: time, the exam and its mode. Right: what is
 * shown (the desktop or its Readme) and the desktop's menu (size, resolution,
 * reset), then the attempt's own controls: in practice the assistant, Quit
 * and Finish; in an exam only End Exam, as on the real one.
 */
export function TopBar({
	attempt,
	startedAt,
	endsAt,
	view,
	onView,
	desktop,
	assistantOpen,
	onAssistant,
	onFinish,
	onQuit,
}: {
	attempt: Attempt;
	startedAt: number;
	endsAt: number | null;
	view: DeskView;
	onView: (view: DeskView) => void;
	desktop: DesktopMenuProps;
	assistantOpen: boolean;
	onAssistant: (open: boolean) => void;
	/** Grade every task (End Exam, Finish) */
	onFinish: () => void;
	/** Practice: leave without grading */
	onQuit: () => void;
}) {
	const practice = attempt.mode === "practice";
	return (
		// Labels give way to icons as the window narrows (container queries)
		<header className="@container flex h-12 shrink-0 select-none items-center gap-3 border-border border-b px-3">
			<Timer startedAt={startedAt} endsAt={endsAt} />
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<strong className="min-w-0 truncate text-[15px]">{attempt.title}</strong>
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
				{practice && (
					// Like Chrome's side panel button: the assistant opens beside the desktop
					<IconButton
						variant="plain"
						size="sm"
						className="size-7"
						active={assistantOpen}
						aria-pressed={assistantOpen}
						aria-label={assistantOpen ? "Hide assistant" : "Show assistant"}
						onClick={() => onAssistant(!assistantOpen)}
					>
						<PanelRight />
					</IconButton>
				)}
			</div>

			<Separator orientation="vertical" className="h-5 self-center" />

			<div className="flex shrink-0 items-center gap-1.5">
				{practice && (
					<Confirm
						title="Quit the practice?"
						description="Your work is not graded and its clusters are removed. You cannot come back to it."
						action="Quit"
						onConfirm={onQuit}
					>
						<Button size="push" variant="ghost">
							Quit
						</Button>
					</Confirm>
				)}
				<Confirm
					title={practice ? "Finish the practice?" : "End the exam?"}
					description="Your work is graded now and the environment is removed. You cannot come back to it."
					action={practice ? "Finish" : "End exam"}
					onConfirm={onFinish}
				>
					{practice ? (
						<Button size="push" variant="outline">
							<Flag /> <span className="sr-only @2xl:not-sr-only">Finish</span>
						</Button>
					) : (
						<Button
							size="push"
							variant="outline"
							className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
						>
							<X /> <span className="sr-only @2xl:not-sr-only">End Exam</span>
						</Button>
					)}
				</Confirm>
			</div>
		</header>
	);
}

/** Ends the attempt only once confirmed: nothing comes back after it */
function Confirm({
	title,
	description,
	action,
	onConfirm,
	children,
}: {
	title: string;
	description: string;
	action: string;
	onConfirm: () => void;
	children: ReactNode;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep working</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: "destructive" })}
						onClick={onConfirm}
					>
						{action}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
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
