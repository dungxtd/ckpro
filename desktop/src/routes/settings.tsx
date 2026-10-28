import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Chip } from "@ckdry/ui/components/chip";
import { Input } from "@ckdry/ui/components/input";
import { Loading } from "@ckdry/ui/components/loading";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ckdry/ui/components/tabs";
import { Copy, Info, Monitor, RotateCw, Sparkles, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/account/sign-in-dialog";
import { ClaudeIcon } from "@/components/claude-icon";
import { RESOLUTIONS, useDesktopSettings } from "@/components/exam/desktop-menu";
import { TextSize } from "@/components/exam/question-panel";
import { useCoach } from "@/stores/coach";
import { useAssistantEnabled, useSettings } from "@/stores/settings";
import {
	type AgentPermission,
	type AgentSettings,
	type AppInfo,
	agentApi,
	appApi,
	coachApi,
	type Runtime,
	type RuntimeInfo,
} from "@/tauri/api";

/**
 * The app's settings in sections, as macOS System Settings lays them out: the
 * exam desk, the AI (the assistant, its Claude Code runtime, what its agent
 * may do and what it is given), and about the app.
 */
export function SettingsRoute() {
	return (
		<Tabs defaultValue="ai" className="h-full">
			<TabsList aria-label="Settings">
				<TabsTrigger value="general">
					<Monitor /> Exam desk
				</TabsTrigger>
				<TabsTrigger value="ai">
					<Sparkles /> AI
				</TabsTrigger>
				<TabsTrigger value="about">
					<Info /> About
				</TabsTrigger>
			</TabsList>
			<TabsContent value="general">
				<Page>
					<DeskSettings />
				</Page>
			</TabsContent>
			<TabsContent value="ai">
				<Page>
					<AiSettings />
				</Page>
			</TabsContent>
			<TabsContent value="about">
				<Page>
					<AboutSettings />
				</Page>
			</TabsContent>
		</Tabs>
	);
}

function Page({ children }: { children: ReactNode }) {
	return <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">{children}</div>;
}

// ---- AI ---------------------------------------------------------------------

const RUNTIMES: { value: Runtime; label: string }[] = [
	{ value: "auto", label: "Auto" },
	{ value: "mac", label: "This Mac" },
	{ value: "docker", label: "Docker" },
];
const PERMISSIONS: { value: AgentPermission; label: string }[] = [
	{ value: "confirm", label: "Ask before every command" },
	{ value: "read_only", label: "Run read-only commands unasked" },
	{ value: "all", label: "Run every command unasked" },
];
const TIMEOUTS = [15, 30, 60, 120, 180, 300];

/** The assistant, its runtime, its tools and what it is given: saved as they change */
function AiSettings() {
	const enabled = useAssistantEnabled();
	const update = useSettings(s => s.update);
	const [settings, setSettings] = useState<AgentSettings | null>(null);
	const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
	const recheck = useCallback(() => {
		setRuntime(null);
		coachApi.runtime().then(setRuntime, e => toast.error(String(e)));
	}, []);
	useEffect(() => {
		agentApi.settings().then(setSettings, e => toast.error(String(e)));
	}, []);
	useEffect(() => {
		if (enabled) recheck();
	}, [enabled, recheck]);
	const save = (patch: Partial<AgentSettings>) => {
		if (!settings) return;
		const next = { ...settings, ...patch };
		setSettings(next);
		agentApi.save(next).then(
			saved => {
				setSettings(saved);
				useCoach.setState({ shared: { checks: saved.share_checks, cluster: saved.share_cluster } });
				// Another runtime, another CLI: what runs now, and as whom
				if ("runtime" in patch || "claude_path" in patch) {
					recheck();
					useCoach.getState().loadAccount();
				}
			},
			e => toast.error(String(e))
		);
	};

	return (
		<>
			<Group title="Assistant" description="Claude helps while you practise. Never in an exam.">
				<Row label="Use the assistant" detail="Off: the app has no AI anywhere, as in the exam">
					<Switch
						aria-label="Use the assistant"
						checked={enabled}
						onCheckedChange={assistant_enabled => update({ assistant_enabled })}
					/>
				</Row>
				{enabled && settings && (
					<Row label="Start in" detail="Ask answers; Agent may also run commands, each one allowed">
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
				)}
			</Group>
			{enabled && !settings && <Loading fill />}
			{enabled && settings && (
				<>
					<ClaudeCodeCard settings={settings} save={save} runtime={runtime} onRecheck={recheck} />
					<ToolAccess settings={settings} save={save} />
					<Privacy settings={settings} save={save} />
				</>
			)}
		</>
	);
}

type Section = { settings: AgentSettings; save: (patch: Partial<AgentSettings>) => void };

/**
 * Claude Code, the agent: where it runs (this Mac's Claude CLI and its own
 * login, or Docker with a login of its own), the account, the model
 */
function ClaudeCodeCard({
	settings,
	save,
	runtime,
	onRecheck,
}: Section & { runtime: RuntimeInfo | null; onRecheck: () => void }) {
	const coach = useCoach();
	const [path, setPath] = useState(settings.claude_path ?? "");
	const [signingIn, setSigningIn] = useState(false);
	const [signingOut, setSigningOut] = useState(false);
	useEffect(() => {
		coach.loadAccount();
		coach.ensureModels();
	}, [coach.loadAccount, coach.ensureModels]);
	const onMac = runtime?.using === "mac";
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
					<ClaudeIcon className="size-4 text-claude" /> Claude Code
				</span>
			}
			description="The agent behind the assistant, on your own Claude account."
		>
			<Row label="Runtime" detail={runtimeDetail(runtime)}>
				<SegmentedControl
					label="Runtime"
					value={settings.runtime}
					onChange={runtime => save({ runtime })}
					options={RUNTIMES}
				/>
			</Row>
			<div className="flex flex-col gap-2 px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2 text-sm">
						Claude CLI on this Mac
						{runtime === null ? null : runtime.claude ? (
							<Badge variant="success">Detected</Badge>
						) : (
							<Badge variant="destructive">Not found</Badge>
						)}
					</div>
					<Button size="push" variant="push" disabled={runtime === null} onClick={onRecheck}>
						<RotateCw /> Recheck
					</Button>
				</div>
				<div className="text-muted-foreground text-xs">
					{runtime?.claude
						? `${runtime.claude}${runtime.claude_version ? ` · ${runtime.claude_version}` : ""}`
						: "Install Claude Code, or give its path. Docker runs without it."}
					{runtime && !runtime.node && " · Node.js not found: This Mac needs it for the adapter"}
				</div>
				<form
					className="flex gap-2"
					onSubmit={e => {
						e.preventDefault();
						save({ claude_path: path.trim() || null });
					}}
				>
					<Input
						value={path}
						onChange={e => setPath(e.target.value)}
						placeholder="Custom path to claude (optional)"
						aria-label="Custom path to the Claude CLI"
						spellCheck={false}
						className="h-8 font-mono text-xs md:text-xs"
					/>
					<Button
						type="submit"
						size="push"
						variant="push"
						disabled={path === (settings.claude_path ?? "")}
					>
						Save
					</Button>
				</form>
			</div>
			<Row
				label="Account"
				detail={
					account?.signed_in
						? accountDetail(account) + (onMac ? " · this Mac's Claude login" : "")
						: undefined
				}
			>
				{account === null ? (
					<span className="text-muted-foreground text-sm">Checking…</span>
				) : !account.signed_in ? (
					<Button size="push" variant="pushDefault" onClick={() => setSigningIn(true)}>
						Sign In…
					</Button>
				) : onMac ? null : (
					<Button size="push" variant="push" disabled={signingOut} onClick={signOut}>
						{signingOut ? "Signing out…" : "Sign Out"}
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

const runtimeDetail = (runtime: RuntimeInfo | null) =>
	runtime === null
		? "Checking…"
		: runtime.problem
			? runtime.problem
			: runtime.using === "mac"
				? "In use: this Mac's Claude CLI and its login"
				: "In use: Docker, with a login of its own";

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

/** What the Agent profile may do on the task host */
function ToolAccess({ settings, save }: Section) {
	const [entry, setEntry] = useState("");
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
			title="Tool access"
			description="Claude Code's own tools stay off. In Agent mode it gets two of the app's: run a command on the task host, and check the task."
		>
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
		</Group>
	);
}

/** What Claude is given, and what Claude Code reports */
function Privacy({ settings, save }: Section) {
	return (
		<Group
			title="Privacy"
			description="The task itself always goes with a question. These decide what else does."
		>
			<Row label="Share the last check" detail="Which checks passed and why the others failed">
				<Switch
					aria-label="Share the last check"
					checked={settings.share_checks}
					onCheckedChange={share_checks => save({ share_checks })}
				/>
			</Row>
			<Row
				label="Share a look at the cluster"
				detail="A read-only snapshot of the task's namespace"
			>
				<Switch
					aria-label="Share a look at the cluster"
					checked={settings.share_cluster}
					onCheckedChange={share_cluster => save({ share_cluster })}
				/>
			</Row>
			<Row label="Name sessions" detail="Sends the first question to a quick model for a title">
				<Switch
					aria-label="Name sessions"
					checked={settings.auto_titles}
					onCheckedChange={auto_titles => save({ auto_titles })}
				/>
			</Row>
			<Row label="Claude Code telemetry" detail="Usage and error reports to Anthropic">
				<Switch
					aria-label="Claude Code telemetry"
					checked={settings.telemetry}
					onCheckedChange={telemetry => save({ telemetry })}
				/>
			</Row>
		</Group>
	);
}

// ---- Exam desk and about ----------------------------------------------------

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
	if (!info) return <Loading fill />;
	return (
		<Group title="CK --dry-run">
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
	children,
}: {
	title: ReactNode;
	description?: string;
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
			</Card>
		</section>
	);
}

/** One setting: its name (and a line about it) left, its control right */
function Row({
	label,
	detail,
	children,
}: {
	label: string;
	detail?: string;
	children?: ReactNode;
}) {
	return (
		<div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
			<div className="min-w-0">
				<div className="text-sm">{label}</div>
				{detail && <div className="text-muted-foreground text-xs">{detail}</div>}
			</div>
			{children && <div className="shrink-0">{children}</div>}
		</div>
	);
}
