import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Chip } from "@ckdry/ui/components/chip";
import { Input } from "@ckdry/ui/components/input";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ckdry/ui/components/select";
import { Stepper } from "@ckdry/ui/components/stepper";
import { Switch } from "@ckdry/ui/components/switch";
import { Copy, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/account/sign-in-dialog";
import { ClaudeIcon } from "@/components/claude-icon";
import { RESOLUTIONS, useDesktopSettings } from "@/components/exam/desktop-menu";
import { TextSize } from "@/components/exam/question-panel";
import { useCoach } from "@/stores/coach";
import {
	type AgentPermission,
	type AgentSettings,
	type AppInfo,
	agentApi,
	appApi,
	coachApi,
} from "@/tauri/api";

/**
 * The app's settings, grouped like macOS System Settings: Claude (account,
 * model, and where its runtime is), the exam desk's defaults, and where the
 * app keeps its data. The desk's own controls change the same settings.
 */
export function SettingsRoute() {
	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
			<ClaudeSettings />
			<AssistantSettings />
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
			description="The assistant answers with your own Claude account. It runs in Docker; the login stays in the app's volume."
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

const PERMISSIONS: { value: AgentPermission; label: string }[] = [
	{ value: "confirm", label: "Ask before every command" },
	{ value: "read_only", label: "Run read-only commands unasked" },
	{ value: "all", label: "Run every command unasked" },
];
const TIMEOUTS = [15, 30, 60, 120, 180, 300];

/**
 * How the assistant works: the profile it starts in, what its agent may run
 * without asking, how long a command may take, what it never runs, and
 * whether sessions name themselves. Saved as they change
 */
function AssistantSettings() {
	const [settings, setSettings] = useState<AgentSettings | null>(null);
	const [entry, setEntry] = useState("");
	useEffect(() => {
		agentApi.settings().then(setSettings, e => toast.error(String(e)));
	}, []);
	if (!settings) return null;
	const save = (patch: Partial<AgentSettings>) => {
		const next = { ...settings, ...patch };
		setSettings(next);
		agentApi.save(next).then(setSettings, e => toast.error(String(e)));
	};
	const at = TIMEOUTS.indexOf(settings.command_timeout);
	const step = (by: number) =>
		save({
			command_timeout: TIMEOUTS[Math.min(TIMEOUTS.length - 1, Math.max(0, (at < 0 ? 2 : at) + by))],
		});
	const add = () => {
		if (!entry.trim()) return;
		save({ never_run: [...settings.never_run, entry.trim()] });
		setEntry("");
	};

	return (
		<Group
			title="Assistant"
			description="Agent mode lets Claude run commands on the task's host while you practise. Never in an exam."
		>
			<Row label="Start in" detail="The profile each new run of the app starts in">
				<SegmentedControl
					label="Start in"
					value={settings.default_profile}
					onChange={default_profile => save({ default_profile })}
					options={[
						{ value: "ask", label: "Ask" },
						{ value: "agent", label: "Agent" },
					]}
				/>
			</Row>
			<Row label="Agent commands" detail="Read-only: get, describe, logs, top, helm list…">
				<Select
					value={settings.permission}
					onValueChange={permission => save({ permission: permission as AgentPermission })}
				>
					<SelectTrigger aria-label="Agent commands" className="w-64">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PERMISSIONS.map(p => (
							<SelectItem key={p.value} value={p.value}>
								{p.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>
			<Row label="Command time limit">
				<Stepper
					label="Command time limit"
					value={`${settings.command_timeout} s`}
					onDecrement={() => step(-1)}
					onIncrement={() => step(1)}
					decrementDisabled={settings.command_timeout <= TIMEOUTS[0]}
					incrementDisabled={settings.command_timeout >= TIMEOUTS[TIMEOUTS.length - 1]}
				/>
			</Row>
			<div className="flex flex-col gap-2 px-4 py-3">
				<div>
					<div className="text-sm">Never run</div>
					<div className="text-muted-foreground text-xs">
						Commands containing these are refused, whatever you allow. Always refused: kind, docker,
						reboot and shutdown, rm -r /.
					</div>
				</div>
				{settings.never_run.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{settings.never_run.map(p => (
							<Chip key={p} size="xs" className="gap-1 font-mono">
								{p}
								<button
									type="button"
									aria-label={`Remove ${p}`}
									className="text-muted-foreground hover:text-foreground"
									onClick={() => save({ never_run: settings.never_run.filter(x => x !== p) })}
								>
									<X className="size-3" />
								</button>
							</Chip>
						))}
					</div>
				)}
				<form
					className="flex gap-2"
					onSubmit={e => {
						e.preventDefault();
						add();
					}}
				>
					<Input
						value={entry}
						onChange={e => setEntry(e.target.value)}
						placeholder="kubectl delete namespace"
						aria-label="Command to never run"
						spellCheck={false}
						className="h-8 font-mono text-xs md:text-xs"
					/>
					<Button type="submit" size="push" variant="push" disabled={!entry.trim()}>
						Add
					</Button>
				</form>
			</div>
			<Row label="Name sessions" detail="From their first question, with a quick model">
				<Switch
					aria-label="Name sessions"
					checked={settings.auto_titles}
					onCheckedChange={auto_titles => save({ auto_titles })}
				/>
			</Row>
		</Group>
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
