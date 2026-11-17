import { Alert } from "@ckpro/ui/components/alert";
import { Button } from "@ckpro/ui/components/button";
import { Spinner } from "@ckpro/ui/components/spinner";
import { StatusChip } from "@ckpro/ui/components/status-chip";
import { cn } from "@ckpro/ui/lib/utils";
import { CircleAlert, CircleArrowUp, Download, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useExam } from "@/stores/exam";
import {
	updateActions as actions,
	isRequired,
	type UpdateStatus,
	useUpdate,
} from "@/stores/update";

/** How long the chip keeps its words out when it announces an update */
const ANNOUNCED_MS = 8000;

/** Versions announced this run: once each */
const announcedThisRun = new Set<string>();

/** An exam-mode attempt is under way: nothing about updates anywhere */
const useExamOn = () =>
	useExam(s => {
		const state = s.state;
		return (
			!!state &&
			"attempt" in state &&
			state.attempt?.mode === "exam" &&
			state.phase !== "finished" &&
			state.phase !== "failed"
		);
	});

/** The title bar's update, as Rust has it: never on the exam desk, nor
 * while an exam-mode attempt runs */
export function UpdateCorner() {
	const info = useUpdate(s => s.info);
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const examOn = useExamOn();
	if (!info) return null;
	return (
		<UpdateChip
			status={info.status}
			dismissed={info.dismissed}
			hidden={pathname === "/exam" || examOn}
			onRestart={actions.restart}
			onDownload={() => actions.download(info.status)}
			onCheck={actions.check}
			onOpen={() => navigate("/settings")}
			onDismiss={actions.dismiss}
		/>
	);
}

/** Where an exam is started, while a newer CKPro is required */
export function UpdateBanner() {
	const status = useUpdate(s => s.info?.status);
	const navigate = useNavigate();
	if (!status) return null;
	return (
		<UpdateRequiredNotice
			status={status}
			onRestart={actions.restart}
			onOpen={() => navigate("/settings")}
		/>
	);
}

/**
 * The update in the title bar's corner, beside what runs in the background:
 * an icon that slides out to its words under the pointer. Nothing while
 * there is nothing to do (up to date, an automatic check). When an update is
 * first ready it slides out by itself, as a toast would, and folds back. A
 * press does the one thing that fits: restart on it, download it, check
 * again; otherwise Settings > About, which tells it in full. The × beside
 * its words puts it away until there is something new (`dismissed`, as Rust
 * keeps it: it still installs when CKPro quits, and About still has it); a
 * required update has none. `hidden` while an exam-mode attempt runs and on
 * the exam desk: the candidate is left to the exam
 */
export function UpdateChip({
	status,
	dismissed,
	onRestart,
	onDownload,
	onCheck,
	onOpen,
	onDismiss,
	announced = announcedThisRun,
	expanded = false,
	hidden = false,
}: {
	status: UpdateStatus;
	/** Put away (Not now) */
	dismissed: boolean;
	onRestart: () => void;
	/** The release page, in the browser (an update installed by hand) */
	onDownload: () => void;
	onCheck: () => void;
	/** Settings > About */
	onOpen: () => void;
	/** Not now: the × */
	onDismiss: () => void;
	/** Versions already announced (the design system keeps its own) */
	announced?: Set<string>;
	/** Its words out for good (the design system, showing every state) */
	expanded?: boolean;
	/** Not shown at all (an exam running, the exam desk) */
	hidden?: boolean;
}) {
	const [announcing, setAnnouncing] = useState(false);
	const news =
		!dismissed &&
		((status.state === "ready" && status.blocked === null) || status.state === "manual")
			? status.version
			: null;
	useEffect(() => {
		if (hidden || !news || announced.has(news)) return;
		announced.add(news);
		setAnnouncing(true);
		const id = setTimeout(() => setAnnouncing(false), ANNOUNCED_MS);
		return () => clearTimeout(id);
	}, [news, announced, hidden]);

	const chip = chipOf(status);
	if (hidden || dismissed || !chip) return null;
	const press =
		status.state === "ready" && status.blocked === null
			? onRestart
			: status.state === "manual"
				? onDownload
				: status.state === "failed"
					? onCheck
					: status.state === "restarting"
						? undefined
						: onOpen;
	return (
		<StatusChip
			icon={chip.icon}
			words={chip.words}
			tone={chip.tone}
			expanded={expanded || announcing}
			onClick={press}
			onDismiss={canDismiss(status) ? onDismiss : undefined}
			dismissLabel={status.state === "failed" ? "Dismiss" : "Not now"}
		/>
	);
}

/** Whether the × puts it away: not a required update, nor a download */
export function canDismiss(s: UpdateStatus) {
	return ((s.state === "ready" || s.state === "manual") && !s.required) || s.state === "failed";
}

/** The icon, its words and its tint for a state; none: nothing to show */
function chipOf(s: UpdateStatus): {
	icon: ReactNode;
	words: string;
	tone: "default" | "highlight" | "warning" | "destructive";
} | null {
	const icon = "size-3.5 text-current";
	switch (s.state) {
		case "idle":
		case "checking":
			return null;
		case "downloading": {
			const percent = s.total ? Math.round(((s.done ?? 0) / s.total) * 100) : null;
			return {
				icon: <DownloadRing value={percent ?? 0} />,
				words: `Downloading CKPro ${s.version}${percent === null ? "" : `, ${percent}%`}`,
				tone: "default",
			};
		}
		case "ready":
			return {
				icon: <CircleArrowUp className={icon} />,
				words: s.blocked
					? `CKPro ${s.version} installs after ${s.blocked}`
					: `Restart to update to CKPro ${s.version}${s.required ? " (required)" : ""}`,
				tone: s.required ? "warning" : s.blocked ? "default" : "highlight",
			};
		case "manual":
			return {
				icon: <Download className={icon} />,
				words: `Download CKPro ${s.version}${s.required ? " (required)" : ""}`,
				tone: s.required ? "warning" : "highlight",
			};
		case "failed":
			return {
				icon: <CircleAlert className={icon} />,
				words: "Could not check for updates: try again",
				tone: "destructive",
			};
		case "restarting":
			return {
				icon: <Spinner size="inline" decorative className="m-0 size-3.5" />,
				words: `Updating to CKPro ${s.version}`,
				tone: "default",
			};
	}
}

/** How far a download is, as a ring the size of an icon */
function DownloadRing({ value }: { value: number }) {
	const r = 5.5;
	const length = 2 * Math.PI * r;
	return (
		<svg viewBox="0 0 14 14" className="size-3.5 -rotate-90" aria-hidden>
			<circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-foreground/15" />
			<circle
				cx="7"
				cy="7"
				r={r}
				fill="none"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray={length}
				strokeDashoffset={length * (1 - Math.max(0, Math.min(100, value)) / 100)}
				className="stroke-highlight transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
			/>
		</svg>
	);
}

/**
 * Where an exam is started (Home, the exams), while a newer version is
 * required: no new attempt starts until CKPro runs on it. A running attempt
 * is never cut short: this shows once it has ended
 */
export function UpdateRequiredNotice({
	status,
	onRestart,
	onOpen,
}: {
	status: UpdateStatus;
	onRestart: () => void;
	onOpen: () => void;
}) {
	if (!isRequired(status) || (status.state !== "ready" && status.state !== "manual")) return null;
	const held = status.state === "ready" && status.blocked !== null;
	return (
		<Alert variant="warning" className="items-center">
			<TriangleAlert className="mt-0!" />
			<p className="min-w-0 flex-1">
				<strong>CKPro {status.version} is required to start an exam.</strong>{" "}
				{status.state === "manual"
					? "Install it, then open CKPro again."
					: held
						? `It installs after ${status.blocked}.`
						: "Your clusters keep running while CKPro restarts."}
			</p>
			{status.state === "ready" ? (
				<Button size="push" variant="pushDefault" disabled={held} onClick={onRestart}>
					Restart to update
				</Button>
			) : (
				<Button size="push" variant="push" onClick={onOpen}>
					How to install
				</Button>
			)}
		</Alert>
	);
}

/** The whole window while the update installs and CKPro starts again
 * (`className`: placed otherwise, as the design system shows it in a frame) */
export function Restarting({ version, className }: { version: string; className?: string }) {
	return (
		<div
			role="status"
			className={cn(
				"fixed inset-0 z-50 grid animate-enter place-items-center bg-background/90 backdrop-blur-sm",
				className
			)}
		>
			<div className="flex flex-col items-center gap-3 text-center">
				<Spinner size="sm" decorative />
				<div className="font-semibold text-lead">Updating to CKPro {version}</div>
				<p className="max-w-xs text-callout text-muted-foreground">
					CKPro opens again in a moment. Your clusters keep running.
				</p>
			</div>
		</div>
	);
}

/** Once, as the first run on a new version opens */
export function toastUpdated(version: string, onNotes: () => void) {
	toast.success(`Updated to CKPro ${version}`, {
		action: { label: "What's new", onClick: onNotes },
	});
}
