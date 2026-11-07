import { Button } from "@cktry/ui/components/button";
import { Chip } from "@cktry/ui/components/chip";
import { Input } from "@cktry/ui/components/input";
import { Loading } from "@cktry/ui/components/loading";
import { SegmentedControl } from "@cktry/ui/components/segmented-control";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@cktry/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@cktry/ui/components/sheet";
import { StatusDot } from "@cktry/ui/components/status-dot";
import { Stepper } from "@cktry/ui/components/stepper";
import { Switch } from "@cktry/ui/components/switch";
import { cn } from "@cktry/ui/lib/utils";
import { ChevronRight, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MASK } from "@/analytics";
import { AGENTS, agentOf } from "@/components/assistant/agents";
import { effortLabel, shortName } from "@/components/assistant/models";
import { SignInDialog } from "@/components/assistant/sign-in-dialog";
import { Group, Row } from "@/components/settings/layout";
import { useCoach } from "@/stores/coach";
import { useAssistantEnabled, useSettings } from "@/stores/settings";
import {
	type AgentPermission,
	type AgentSettings,
	agentApi,
	errorText,
	type Provider,
	type RuntimeInfo,
} from "@/tauri/api";

const PERMISSIONS: { value: AgentPermission; label: string }[] = [
	{ value: "confirm", label: "Ask before every command" },
	{ value: "read_only", label: "Run read-only commands unasked" },
	{ value: "all", label: "Run every command unasked" },
];
const TIMEOUTS = [15, 30, 60, 120, 180, 300];

/**
 * The assistant and its agents: a list of agents (each opens in a side
 * panel), then what applies to every agent. Saved as they change
 */
export function AiSettings() {
	const enabled = useAssistantEnabled();
	const update = useSettings(s => s.update);
	const coach = useCoach();
	const [settings, setSettings] = useState<AgentSettings | null>(null);
	// What was read as the app opened (no checking here); Recheck reads again
	const runtime = coach.runtime;
	const [checking, setChecking] = useState(false);
	const [open, setOpen] = useState<Provider | null>(null);
	const recheck = useCallback(async () => {
		setChecking(true);
		const { loadRuntime, loadAccount } = useCoach.getState();
		await Promise.all([loadRuntime(), loadAccount()]);
		setChecking(false);
	}, []);
	useEffect(() => {
		agentApi.settings().then(setSettings, e => toast.error(errorText(e)));
	}, []);
	useEffect(() => {
		if (enabled) coach.warm();
	}, [enabled, coach.warm]);
	const save = (patch: Partial<AgentSettings>) => {
		if (!settings) return;
		const before = settings;
		const next = { ...settings, ...patch };
		setSettings(next);
		agentApi.save(next).then(
			saved => {
				setSettings(saved);
				useCoach.setState({
					enabledAgents: saved.enabled,
					shared: { checks: saved.share_checks, cluster: saved.share_cluster },
				});
				// Another CLI: what runs now, and as whom
				if ("claude_path" in patch) recheck();
			},
			e => {
				// Not kept: the switch or field shows what is kept
				setSettings(before);
				toast.error(errorText(e));
			}
		);
	};
	const agent = open ? agentOf(open) : null;

	return (
		<>
			<Group description="Agents help while you practise. Never in an exam.">
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
			{enabled && !settings && <Loading fill label="Loading the agents…" />}
			{enabled && settings && (
				<>
					<Group
						title="Agents"
						description="Agents turned on and signed in are offered when you start a session."
					>
						{AGENTS.map(a => {
							const on = settings.enabled.includes(a.id);
							return (
								// The switch turns it on or off in place; the rest of the row opens it
								<div key={a.id} className="flex items-center gap-3 pr-4 hover:bg-foreground/5">
									<button
										type="button"
										onClick={() => setOpen(a.id)}
										className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
									>
										<a.Icon className={cn("size-5 shrink-0", a.tint, !on && "opacity-50")} />
										<div className="min-w-0 flex-1">
											<div className="text-lead leading-snug">{a.name}</div>
											<div className="truncate text-muted-foreground text-xs">
												{agentSummary(on, runtime, coach.account)}
											</div>
										</div>
										<AgentState
											on={on}
											runtime={runtime}
											signedIn={coach.account?.signed_in ?? null}
										/>
										<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
									</button>
									<Switch
										aria-label={`Turn ${a.name} on`}
										checked={on}
										onCheckedChange={next =>
											save({
												enabled: next
													? [...settings.enabled, a.id]
													: settings.enabled.filter(p => p !== a.id),
											})
										}
									/>
								</div>
							);
						})}
					</Group>
					<ToolAccess settings={settings} save={save} />
					<Privacy settings={settings} save={save} />
					<Sheet open={agent !== null} onOpenChange={o => !o && setOpen(null)}>
						<SheetContent className="w-[440px] gap-0 sm:max-w-md">
							{agent && (
								<>
									<SheetHeader className="flex-row items-center gap-2 border-border border-b pr-14">
										<agent.Icon className={cn("size-5", agent.tint)} />
										<SheetTitle>{agent.name}</SheetTitle>
										<SheetDescription className="sr-only">{agent.name}'s settings</SheetDescription>
									</SheetHeader>
									<div className="overflow-auto">
										<ClaudeCodePanel
											settings={settings}
											save={save}
											runtime={runtime}
											checking={checking}
											onRecheck={recheck}
										/>
									</div>
								</>
							)}
						</SheetContent>
					</Sheet>
				</>
			)}
		</>
	);
}

type Section = { settings: AgentSettings; save: (patch: Partial<AgentSettings>) => void };

/** One line under an agent's name: where it runs and as whom, or what it needs */
function agentSummary(
	on: boolean,
	runtime: RuntimeInfo | null,
	account: { signed_in: boolean; email: string | null } | null
) {
	if (!on) return "Turned off";
	if (runtime === null || account === null) return "Checking…";
	if (runtime.problem) return runtime.problem;
	if (!account.signed_in) return "Not signed in";
	return account.email ?? "Signed in";
}

/** Ready or not, as a dot and a word */
function AgentState({
	on,
	runtime,
	signedIn,
}: {
	on: boolean;
	runtime: RuntimeInfo | null;
	signedIn: boolean | null;
}) {
	if (!on || runtime === null || signedIn === null) return null;
	const ready = !runtime.problem && signedIn;
	return (
		<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
			<StatusDot tone={ready ? "ok" : "warn"} className="size-1.5" />
			{ready ? "Ready" : runtime.problem ? "Not found" : "Sign in"}
		</span>
	);
}

/** Claude Code's own settings: on or off, the CLI, the account, the model */
function ClaudeCodePanel({
	settings,
	save,
	runtime,
	checking,
	onRecheck,
}: Section & { runtime: RuntimeInfo | null; checking: boolean; onRecheck: () => void }) {
	const coach = useCoach();
	const [path, setPath] = useState(settings.claude_path ?? "");
	const [signingIn, setSigningIn] = useState(false);
	const account = coach.account;
	// The models and efforts it offers: its adapter starts for them
	useEffect(() => {
		useCoach.getState().ensureModels();
	}, []);
	return (
		<div>
			<div className="flex flex-col gap-2 px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<div className="text-lead leading-snug">Claude CLI</div>
					<Button size="push" variant="push" disabled={checking} onClick={onRecheck}>
						<RotateCw className={cn(checking && "animate-spin")} /> Recheck
					</Button>
				</div>
				<div className="break-all text-muted-foreground text-xs">
					{runtime === null
						? "Checking…"
						: runtime.claude
							? `${runtime.claude}${runtime.claude_version ? ` · ${runtime.claude_version}` : ""}`
							: "Not found: install Claude Code, or give its path"}
					{runtime && !runtime.node && " · Node.js not found (it runs the adapter)"}
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
						placeholder="Custom path to claude"
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
				// The email: not in replays
				className={MASK}
				detail={account?.signed_in ? `${accountDetail(account)} · the CLI's login` : undefined}
			>
				{account === null ? (
					<span className="text-muted-foreground text-sm">Checking…</span>
				) : account.signed_in ? null : (
					<Button size="push" variant="pushDefault" onClick={() => setSigningIn(true)}>
						Sign In…
					</Button>
				)}
			</Row>
			<Row label="Model" detail="The assistant's picker changes it too">
				<Select value={coach.model} onValueChange={coach.setModel}>
					<SelectTrigger aria-label="Model">
						<SelectValue placeholder="Loading…" />
					</SelectTrigger>
					<SelectContent>
						{coach.models.map(m => (
							<SelectItem key={m.value} value={m.value}>
								{shortName(m, m.name)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>
			{coach.efforts.length > 0 && (
				<Row label="Effort">
					<Select value={coach.effort} onValueChange={coach.setEffort}>
						<SelectTrigger aria-label="Effort">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{coach.efforts.map(e => (
								<SelectItem key={e.value} value={e.value}>
									{effortLabel(e.value, e.name)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Row>
			)}
			<Row label="Telemetry" detail="Claude Code's usage and error reports to Anthropic">
				<Switch
					aria-label="Claude Code telemetry"
					checked={settings.telemetry}
					onCheckedChange={telemetry => save({ telemetry })}
				/>
			</Row>
			<SignInDialog open={signingIn} onOpenChange={setSigningIn} />
		</div>
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
			description="For every agent: its own tools stay off. In Agent mode it gets two of the app's: run a command on the task host, and check the task."
		>
			<Row label="Agent commands" detail="Read-only: get, describe, logs, top, helm list…">
				<Select
					value={settings.permission}
					onValueChange={permission => save({ permission: permission as AgentPermission })}
				>
					<SelectTrigger aria-label="Agent commands">
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
			<div className="ml-4 flex flex-col gap-2 border-border border-t py-3 pr-4">
				<div>
					<div className="text-lead leading-snug">Never run</div>
					<div className="text-muted-foreground text-xs">
						Commands containing these are refused, whatever you allow. Always refused: kind, docker,
						reboot and shutdown, rm -r /.
					</div>
				</div>
				{settings.never_run.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{settings.never_run.map(p => (
							<Chip
								key={p}
								size="xs"
								className="font-mono"
								onRemove={() => save({ never_run: settings.never_run.filter(x => x !== p) })}
							>
								{p}
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
			description="For every agent: the task always goes with a question; these decide what else does."
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
		</Group>
	);
}

// ---- Exam desk and about ----------------------------------------------------
