import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { Progress } from "@ckpro/ui/components/progress";
import { Spinner } from "@ckpro/ui/components/spinner";
import {
	CircleAlert,
	CircleArrowUp,
	CircleCheck,
	Download,
	ExternalLink,
	RefreshCw,
} from "lucide-react";
import { Group, Row } from "@/components/settings/layout";
import { CopyBlock } from "@/components/text/copy-text";
import { Markdown } from "@/components/text/markdown";
import { ago, size, type UpdateInfo, updateActions, useUpdate } from "@/stores/update";

/**
 * Settings > About's updates: where CKPro is (up to date, downloading,
 * ready, to install by hand), what the new version brings, and the one
 * action that fits. The rest happens without asking: checks every few
 * hours, the download, the install when CKPro quits
 */
export function UpdateGroup({
	info,
	onCheck,
	onRestart,
	onDownload,
}: {
	info: UpdateInfo;
	onCheck: () => void;
	onRestart: () => void;
	/** The release page, in the browser (an update installed by hand) */
	onDownload: () => void;
}) {
	const s = info.status;
	return (
		<Group
			title="Updates"
			description="CKPro checks for updates every few hours and downloads them by itself. It never restarts during an attempt."
		>
			{s.state === "idle" && (
				<Row
					icon={<CircleCheck />}
					label="CKPro is up to date"
					detail={`Version ${info.current}, ${s.checked_at ? `checked ${ago(s.checked_at)}` : "not checked yet"}`}
				>
					<Button size="push" variant="push" onClick={onCheck}>
						Check now
					</Button>
				</Row>
			)}
			{s.state === "checking" && (
				<Row icon={<RefreshCw />} label="Checking for updates" detail={`Version ${info.current}`}>
					<Spinner size="inline" />
				</Row>
			)}
			{s.state === "failed" && (
				<Row icon={<CircleAlert />} label="Could not check for updates" detail={s.message}>
					<Button size="push" variant="push" onClick={onCheck}>
						Try again
					</Button>
				</Row>
			)}
			{s.state === "downloading" && (
				<Row
					icon={<Download />}
					label={`Downloading CKPro ${s.version}`}
					detail={s.total ? `${size(s.done ?? 0)} of ${size(s.total)}` : size(s.done ?? 0)}
				>
					<Progress
						className="w-32"
						label={`Downloading CKPro ${s.version}`}
						value={s.total ? ((s.done ?? 0) / s.total) * 100 : 0}
					/>
				</Row>
			)}
			{s.state === "ready" && (
				<Row
					icon={<CircleArrowUp />}
					label={`CKPro ${s.version} is ready to install`}
					detail={
						s.blocked
							? `It installs after ${s.blocked}: CKPro does not restart before`
							: s.on_quit
								? "Restart now, or it installs when you quit CKPro"
								: "Restart CKPro to install it"
					}
				>
					<span className="flex items-center gap-2">
						{s.required && <Badge variant="warning">Required</Badge>}
						<Button
							size="push"
							variant="pushDefault"
							disabled={s.blocked !== null}
							onClick={onRestart}
						>
							Restart to update
						</Button>
					</span>
				</Row>
			)}
			{s.state === "manual" && (
				<Row icon={<Download />} label={`CKPro ${s.version} is available`} detail={s.reason}>
					<span className="flex items-center gap-2">
						{s.required && <Badge variant="warning">Required</Badge>}
						<Button size="push" variant="push" onClick={onDownload}>
							<ExternalLink /> Download
						</Button>
					</span>
				</Row>
			)}
			{s.state === "restarting" && (
				<Row
					icon={<RefreshCw />}
					label={`Installing CKPro ${s.version}`}
					detail="CKPro opens again in a moment"
				>
					<Spinner size="inline" />
				</Row>
			)}
			{s.state === "manual" && s.command && (
				<div className="border-border border-t px-4 py-3">
					<p className="pb-2 text-caption text-muted-foreground">Or install it from a terminal:</p>
					<CopyBlock text={s.command} lang="shell" />
				</div>
			)}
			{(s.state === "ready" || s.state === "manual") && s.notes && (
				<div className="border-border border-t px-4 py-3">
					<p className="pb-1 font-medium text-callout">What's new in {s.version}</p>
					<Markdown className="text-callout">{s.notes}</Markdown>
				</div>
			)}
		</Group>
	);
}

/** Settings > About's updates, as Rust has them */
export function UpdateSettings() {
	const info = useUpdate(s => s.info);
	if (!info) return null;
	return (
		<UpdateGroup
			info={info}
			onCheck={updateActions.check}
			onRestart={updateActions.restart}
			onDownload={() => updateActions.download(info.status)}
		/>
	);
}
