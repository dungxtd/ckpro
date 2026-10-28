import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Input } from "@ckdry/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckdry/ui/components/select";
import { Stepper } from "@ckdry/ui/components/stepper";
import { Copy } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/account/sign-in-dialog";
import { ClaudeIcon } from "@/components/claude-icon";
import { RESOLUTIONS, useDesktopSettings } from "@/components/exam/desktop-menu";
import { TextSize } from "@/components/exam/question-panel";
import { useCoach } from "@/stores/coach";
import { type AppInfo, appApi, coachApi, type RuntimeInfo } from "@/tauri/api";

/**
 * The app's settings, grouped like macOS System Settings: Claude (account,
 * model, and where its runtime is), the exam desk's defaults, and where the
 * app keeps its data. The desk's own controls change the same settings.
 */
export function SettingsRoute() {
	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
			<ClaudeSettings />
			<RuntimeSettings />
			<DeskSettings />
			<AboutSettings />
		</div>
	);
}

function ClaudeSettings() {
	const coach = useCoach();
	const [signingIn, setSigningIn] = useState(false);
	const [signingOut, setSigningOut] = useState(false);
	useEffect(() => {
		coach.loadAccount();
		coach.ensureModels();
	}, [coach.loadAccount, coach.ensureModels]);
	const account = coach.account;
	const signOut = async () => {
		setSigningOut(true);
		try {
			await coachApi.signOut();
			await coach.loadAccount();
		} catch (e) {
			toast.error(String(e));
		} finally {
			setSigningOut(false);
		}
	};

	return (
		<Group
			title={
				<span className="flex items-center gap-2">
					<ClaudeIcon className="size-4 text-claude" /> Claude
				</span>
			}
			description="The assistant answers with your own Claude account, through Claude Code."
		>
			<Row label="Account" detail={account?.signed_in ? accountDetail(account) : undefined}>
				{account === null ? (
					<span className="text-muted-foreground text-sm">Checking…</span>
				) : account.signed_in ? (
					<Button size="push" variant="push" disabled={signingOut} onClick={signOut}>
						{signingOut ? "Signing out…" : "Sign Out"}
					</Button>
				) : (
					<Button size="push" variant="pushDefault" onClick={() => setSigningIn(true)}>
						Sign In…
					</Button>
				)}
			</Row>
			<Row label="Model" detail="Used for new questions; the assistant's picker changes it too">
				<Select value={coach.model} onValueChange={coach.setModel}>
					<SelectTrigger aria-label="Model" className="w-52">
						<SelectValue placeholder="Loading…" />
					</SelectTrigger>
					<SelectContent>
						{coach.models.map(m => (
							<SelectItem key={m.value} value={m.value}>
								{m.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>
			{coach.efforts.length > 0 && (
				<Row label="Effort">
					<Select value={coach.effort} onValueChange={coach.setEffort}>
						<SelectTrigger aria-label="Effort" className="w-52">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{coach.efforts.map(e => (
								<SelectItem key={e.value} value={e.value}>
									{e.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Row>
			)}
			<SignInDialog open={signingIn} onOpenChange={setSigningIn} />
		</Group>
	);
}

const accountDetail = (account: {
	email: string | null;
	method: string | null;
	plan: string | null;
}) =>
	[
		account.email,
		account.method === "console" ? "Anthropic Console" : `Claude ${account.plan ?? "subscription"}`,
	]
		.filter(Boolean)
		.join(" · ");

/** Where npx (which runs the ACP adapter) and Claude Code are */
function RuntimeSettings() {
	const [info, setInfo] = useState<RuntimeInfo | null>(null);
	const [npx, setNpx] = useState("");
	const [claude, setClaude] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const show = useCallback((next: RuntimeInfo) => {
		setInfo(next);
		setNpx(next.paths.npx ?? "");
		setClaude(next.paths.claude ?? "");
	}, []);
	useEffect(() => {
		coachApi.runtime().then(show, e => setError(String(e)));
	}, [show]);
	const changed =
		info !== null && (npx !== (info.paths.npx ?? "") || claude !== (info.paths.claude ?? ""));
	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			show(await coachApi.setRuntime({ npx: npx.trim() || null, claude: claude.trim() || null }));
			// Another runtime may sign in as someone else and offer other models
			useCoach.getState().loadAccount();
			toast.success("The assistant restarts with these paths");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Group
			title="Claude runtime"
			description="Empty fields use what is found on this Mac. The assistant restarts when they change."
			footer={
				<>
					{error && (
						<Alert variant="destructive" className="flex-1">
							{error}
						</Alert>
					)}
					<Button size="push" variant="pushDefault" disabled={!changed || saving} onClick={save}>
						{saving ? "Saving…" : "Save"}
					</Button>
				</>
			}
		>
			<PathRow
				label="Node.js (npx)"
				hint="Runs the Claude ACP adapter"
				value={npx}
				onChange={setNpx}
				found={info?.npx_found}
				fallback="Not found: install Node.js from nodejs.org"
			/>
			<PathRow
				label="Claude Code CLI"
				hint="Leave empty to use the one bundled with the adapter"
				value={claude}
				onChange={setClaude}
				found={info?.claude_found}
				fallback="Bundled with the adapter"
				placeholderIsDefault={false}
			/>
		</Group>
	);
}

/**
 * A path: what is set, or empty for what the app finds. `found` is offered
 * to fill in; with `placeholderIsDefault` the found path is what an empty
 * field uses (npx), otherwise the empty field means `fallback` (the bundled
 * Claude Code)
 */
function PathRow({
	label,
	hint,
	value,
	onChange,
	found,
	fallback,
	placeholderIsDefault = true,
}: {
	label: string;
	hint: string;
	value: string;
	onChange: (value: string) => void;
	found: string | null | undefined;
	fallback: string;
	placeholderIsDefault?: boolean;
}) {
	const placeholder = placeholderIsDefault ? (found ?? fallback) : fallback;
	return (
		<div className="flex flex-col gap-1.5 px-4 py-3">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-sm">{label}</span>
				<span className="text-muted-foreground text-xs">{hint}</span>
			</div>
			<Input
				value={value}
				onChange={e => onChange(e.target.value)}
				placeholder={placeholder}
				spellCheck={false}
				aria-label={label}
				className="h-8 font-mono text-xs md:text-xs"
			/>
			{/* An empty npx field already uses what was found */}
			{found && found !== value && (!placeholderIsDefault || value) && (
				<div className="flex items-center gap-2 text-muted-foreground text-xs">
					<span className="min-w-0 truncate">Found at {found}</span>
					<Button
						size="push"
						variant="link"
						className="h-auto px-0"
						onClick={() => onChange(found)}
					>
						Use it
					</Button>
				</div>
			)}
		</div>
	);
}

function DeskSettings() {
	const desktop = useDesktopSettings();
	const resolution = desktop.resolution ? desktop.resolution.join("x") : "fit";
	return (
		<Group title="Exam desk" description="Also changed from the desk itself, as on the exam.">
			<Row label="Question text size">
				<TextSize />
			</Row>
			<Row label="Desktop size">
				<Stepper
					label="Desktop size"
					value={`${Math.round(desktop.zoom * 100)}%`}
					onDecrement={() => desktop.onZoom(-1)}
					onIncrement={() => desktop.onZoom(1)}
					decrementDisabled={!desktop.canZoomOut}
					incrementDisabled={!desktop.canZoomIn}
				/>
			</Row>
			<Row label="Desktop resolution">
				<Select
					value={resolution}
					onValueChange={value =>
						desktop.onResolution(
							value === "fit" ? null : (value.split("x").map(Number) as [number, number])
						)
					}
				>
					<SelectTrigger aria-label="Desktop resolution" className="w-52">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="fit">Fit to screen</SelectItem>
						{RESOLUTIONS.map(([w, h]) => (
							<SelectItem key={`${w}x${h}`} value={`${w}x${h}`}>
								{w} × {h}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>
		</Group>
	);
}

function AboutSettings() {
	const [info, setInfo] = useState<AppInfo | null>(null);
	useEffect(() => {
		appApi.info().then(setInfo);
	}, []);
	if (!info) return null;
	return (
		<Group title="About">
			<Row label="Version">
				<span className="text-muted-foreground text-sm tabular-nums">{info.version}</span>
			</Row>
			<Row label="Data folder" detail="Database, kubeconfigs, your questions">
				<Button
					size="push"
					variant="push"
					onClick={() => {
						navigator.clipboard.writeText(info.data_dir);
						toast.success("Path copied", { duration: 1500 });
					}}
				>
					<Copy /> Copy path
				</Button>
			</Row>
		</Group>
	);
}

/** A titled group of rows on one card, like a System Settings section */
function Group({
	title,
	description,
	footer,
	children,
}: {
	title: ReactNode;
	description?: string;
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			<div className="px-1">
				<h2 className="font-semibold text-sm">{title}</h2>
				{description && <p className="text-muted-foreground text-xs">{description}</p>}
			</div>
			<Card padding="none" className="divide-y divide-border">
				{children}
				{footer && <div className="flex items-center justify-end gap-3 px-4 py-3">{footer}</div>}
			</Card>
		</section>
	);
}

/** One setting: its name (and a line about it) left, its control right */
function Row({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
	return (
		<div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
			<div className="min-w-0">
				<div className="text-sm">{label}</div>
				{detail && <div className="truncate text-muted-foreground text-xs">{detail}</div>}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}
