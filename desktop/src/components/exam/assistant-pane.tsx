import { Alert } from "@ckdry/ui/components/alert";
import { Badge } from "@ckdry/ui/components/badge";
import { Button } from "@ckdry/ui/components/button";
import { Chip } from "@ckdry/ui/components/chip";
import { CodeBlock } from "@ckdry/ui/components/code-block";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@ckdry/ui/components/dropdown-menu";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Input } from "@ckdry/ui/components/input";
import { menu, menuRow } from "@ckdry/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckdry/ui/components/popover";
import { Spinner } from "@ckdry/ui/components/spinner";
import { Textarea } from "@ckdry/ui/components/textarea";
import { Truncated } from "@ckdry/ui/components/truncated";
import { cn } from "@ckdry/ui/lib/utils";
import {
	ArrowUp,
	AtSign,
	Check,
	ChevronDown,
	Ellipsis,
	History,
	Maximize2,
	Minimize2,
	Plus,
	RotateCw,
	Square,
	TriangleAlert,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/account/sign-in-dialog";
import { AGENTS } from "@/components/ai/agents";
import { blurb, effortLabel, shortName } from "@/components/ai/models";
import { ClaudeIcon } from "@/components/claude-icon";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import {
	type CheckResult,
	type CoachSession,
	type CoachStatus,
	coachApi,
	type PermissionOption,
	type Profile,
	type QuestionView,
} from "@/tauri/api";
import { Answer } from "./answer";

const tokens = (n: number) =>
	n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

/**
 * The assistant, laid out as an agent panel: one agent (ACP,
 * Claude) and one conversation per question. It reads the task and, as
 * chosen with @, the last check and a look at the cluster; it never runs
 * anything. Code in answers copies to the exam desktop, links open in its
 * Firefox. `review`: the attempt's result, the exam being over.
 */
export function AssistantPane({
	question,
	review,
	onClose,
	onOpenQuestion,
}: {
	question: QuestionView;
	review?: { checks: CheckResult[] };
	onClose?: () => void;
	/** History: show another question's conversation */
	onOpenQuestion?: (questionId: string) => void;
}) {
	const coach = useCoach();
	const lastCheck = useExam(s => s.checks[question.id]);
	const checks = review?.checks ?? (Array.isArray(lastCheck) ? lastCheck : undefined);
	const messages = coach.sessions[question.id] ?? [];
	const writing = coach.writing === question.id;
	const usage = coach.usage[question.id];
	const model = coach.models.find(m => m.value === coach.model);
	const modelName = model?.name ?? coach.model;
	// Beside the model, muted, once one is picked (Auto says nothing)
	const effortName =
		coach.efforts.length > 0 && coach.effort !== "default" ? effortLabel(coach.effort) : null;
	const [status, setStatus] = useState<CoachStatus | null>(null);
	const [draft, setDraft] = useState("");
	const [expanded, setExpanded] = useState(false);
	const [history, setHistory] = useState<CoachSession[]>([]);
	const [signingIn, setSigningIn] = useState(false);
	const [renaming, setRenaming] = useState(false);
	// The menu open, if any: a choice closes it
	const [open, setOpen] = useState<"new" | "history" | "more" | null>(null);
	const menuOf = (name: NonNullable<typeof open>) => ({
		open: open === name,
		onOpenChange: (next: boolean) => setOpen(next ? name : null),
	});
	const signedOut = coach.account?.signed_in === false;
	// The agents offered: turned on in Settings and signed in
	const claudeOn = coach.enabledAgents.includes("claude");
	const agents = AGENTS.filter(a => coach.enabledAgents.includes(a.id) && coach.account?.signed_in);
	const scroller = useRef<HTMLDivElement>(null);

	useEffect(() => {
		coachApi.status().then(setStatus);
		if (!useCoach.getState().account) useCoach.getState().loadAccount();
	}, []);
	useEffect(() => {
		coach.load(question.id);
	}, [coach.load, question.id]);
	// Follow the answer as it is written, unless the reader scrolled up
	const written = messages.reduce((n, m) => n + m.text.length + 1, 0);
	useEffect(() => {
		const el = scroller.current;
		if (el && written > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 160)
			el.scrollTop = el.scrollHeight;
	}, [written]);

	const send = (text: string) => {
		const t = text.trim();
		if (!t || coach.writing) return;
		setDraft("");
		coach.ask(question.id, t, review?.checks);
	};
	const title =
		coach.titles[question.id] ?? messages.find(m => m.role === "user")?.text ?? "New Session";
	const lastUser = [...messages].reverse().find(m => m.role === "user")?.text;

	return (
		<aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
			{/* Toolbar: the session (double-click to rename), then new, history, more, close */}
			<div className="flex h-9 shrink-0 select-none items-center gap-0.5 border-border border-b pr-1.5 pl-3">
				{renaming ? (
					<SessionTitleInput
						title={title}
						onDone={next => {
							setRenaming(false);
							if (next !== null && next !== title) coach.rename(question.id, next);
						}}
					/>
				) : (
					// Double-click: a mouse shortcut; More > Rename Session… is the keyboard way
					<Truncated
						className="flex-1 text-callout"
						onDoubleClick={() => messages.length > 0 && setRenaming(true)}
					>
						{title}
					</Truncated>
				)}
				{/* A new session, with one of the agents offered */}
				<Popover {...menuOf("new")}>
					<PopoverTrigger asChild>
						<IconButton
							variant="toolbar"
							size="xs"
							aria-label="New Session"
							disabled={writing || messages.length === 0 || agents.length === 0}
						>
							<Plus />
						</IconButton>
					</PopoverTrigger>
					<PopoverContent align="end" className={cn(menu.surface, "w-56")}>
						<div className={menu.header}>New session with</div>
						{agents.map(a => (
							<button
								key={a.id}
								type="button"
								className={menuRow()}
								onClick={() => {
									setOpen(null);
									coach.clear(question.id);
								}}
							>
								<a.Icon className={cn("size-3.5 shrink-0", a.tint)} />
								<span className={menu.label}>{a.name}</span>
							</button>
						))}
					</PopoverContent>
				</Popover>
				<Popover
					{...menuOf("history")}
					onOpenChange={next => {
						setOpen(next ? "history" : null);
						if (next) coach.listSessions().then(setHistory);
					}}
				>
					<PopoverTrigger asChild>
						<IconButton variant="toolbar" size="xs" aria-label="History">
							<History />
						</IconButton>
					</PopoverTrigger>
					<PopoverContent align="end" className={cn(menu.surface, "w-72")}>
						<div className={menu.header}>This attempt</div>
						{history.length === 0 && (
							<div className={cn(menu.content, "py-1 text-muted-foreground text-xs")}>
								No conversations yet
							</div>
						)}
						{history.map(t => (
							<button
								key={t.question_id}
								type="button"
								className={menuRow()}
								onClick={() => {
									setOpen(null);
									onOpenQuestion?.(t.question_id);
								}}
							>
								{t.question_id === question.id && <Checked />}
								<Truncated>{t.title}</Truncated>
								<span className={menu.hint}>{t.messages / 2}</span>
							</button>
						))}
					</PopoverContent>
				</Popover>
				<Popover {...menuOf("more")}>
					<PopoverTrigger asChild>
						<IconButton variant="toolbar" size="xs" aria-label="More">
							<Ellipsis />
						</IconButton>
					</PopoverTrigger>
					<PopoverContent align="end" className={cn(menu.surface, "w-60")}>
						<div className={menu.header}>Claude account</div>
						{coach.account?.signed_in ? (
							<div className={cn(menu.content, "flex flex-col py-1 text-xs")}>
								<span className="truncate">{coach.account.email ?? "Signed in"}</span>
								<span className="text-muted-foreground capitalize">
									{coach.account.method === "console"
										? "Anthropic Console"
										: `Claude ${coach.account.plan ?? "subscription"}`}
								</span>
							</div>
						) : (
							<button type="button" className={menuRow()} onClick={() => setSigningIn(true)}>
								{coach.account ? "Sign In…" : "Checking…"}
							</button>
						)}
						<div className={menu.separator} />
						<button
							type="button"
							className={menuRow()}
							disabled={messages.length === 0}
							onClick={() => {
								setOpen(null);
								navigator.clipboard
									.writeText(
										messages
											.map(m => `${m.role === "user" ? "## You" : "## Assistant"}\n\n${m.text}`)
											.join("\n\n")
									)
									.then(
										() => toast.success("Session copied as Markdown", { duration: 1500 }),
										() => toast.error("Could not copy the session")
									);
							}}
						>
							Copy Session as Markdown
						</button>
						<button
							type="button"
							className={menuRow()}
							disabled={messages.length === 0}
							onClick={() => {
								setOpen(null);
								setRenaming(true);
							}}
						>
							Rename Session…
						</button>
						<div className={menu.separator} />
						<button
							type="button"
							className={menuRow()}
							disabled={writing || messages.length === 0}
							onClick={() => {
								setOpen(null);
								coach.clear(question.id);
							}}
						>
							Clear Session
						</button>
					</PopoverContent>
				</Popover>
				{onClose && (
					<IconButton variant="toolbar" size="xs" aria-label="Close" onClick={onClose}>
						<X />
					</IconButton>
				)}
			</div>

			<div
				ref={scroller}
				className="min-h-0 flex-1 select-text overflow-y-auto overflow-x-hidden p-2"
			>
				{messages.length === 0 ? (
					// Quiet: Claude's mark, and words only when
					// something is needed (Docker); signing in takes the editor's place
					<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
						<ClaudeIcon className="size-8 text-claude opacity-80" />
						{status && !status.ready && (
							<span className="text-muted-foreground text-xs">{status.problem}</span>
						)}
					</div>
				) : (
					<div className="flex flex-col">
						{messages.map((m, i) =>
							m.role === "user" ? (
								<div
									// Messages only grow at the end
									// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
									key={i}
									className={cn(
										"my-1 flex flex-col gap-1 rounded-lg bg-highlight/[0.08] p-2",
										i > 0 && "mt-5"
									)}
								>
									<span className="self-end font-medium text-3xs text-muted-foreground">You</span>
									<span className="whitespace-pre-wrap text-callout">{m.text}</span>
								</div>
							) : (
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
								<div key={i} className="my-1 flex min-w-0 flex-col gap-1.5 px-2">
									<ClaudeIcon className="size-3.5 text-claude" />
									{m.text ? (
										<Answer>{m.text}</Answer>
									) : (
										<Spinner size="inline" className="size-3.5 text-muted-foreground" />
									)}
									{m.text && !writing && i === messages.length - 1 && lastUser && (
										<div className="flex items-center gap-2 text-3xs text-muted-foreground">
											<Button variant="quiet" size="inline" onClick={() => send(lastUser)}>
												<RotateCw /> Regenerate
											</Button>
											<span className="opacity-60">{modelName}</span>
										</div>
									)}
								</div>
							)
						)}
					</div>
				)}
				{coach.error && (
					<Alert variant="warning" className="mt-2 px-3 py-1.5 text-xs">
						{coach.error}
					</Alert>
				)}
				<SignInDialog open={signingIn} onOpenChange={setSigningIn} />
			</div>

			{/* What the agent is doing (Agent): the command running, or one it asks to run */}
			{coach.permission?.questionId === question.id ? (
				<PermissionCard
					command={coach.permission.command}
					options={coach.permission.options}
					onAnswer={coach.permit}
				/>
			) : (
				coach.running?.questionId === question.id && (
					<div className="flex items-center gap-2 border-border border-t px-3 py-2 text-muted-foreground text-xs">
						<Spinner size="inline" className="size-3.5" />
						<code className="min-w-0 truncate font-mono">$ {coach.running.command}</code>
					</div>
				)
			)}

			{!claudeOn ? (
				// No agent turned on: nothing to ask
				<div className="flex select-none items-center gap-3 border-border border-t bg-card/40 px-3 py-3 text-muted-foreground text-xs">
					No agent is turned on. Turn one on in Settings › AI.
				</div>
			) : signedOut ? (
				// Signed out: the place to type becomes the way in
				<div className="flex select-none items-center gap-3 border-border border-t bg-card/40 px-3 py-3">
					<ClaudeIcon className="size-4 shrink-0 text-claude" />
					<span className="flex-1 text-muted-foreground text-xs">
						Sign in with your Claude account to ask about this task.
					</span>
					<Button size="push" variant="pushDefault" onClick={() => setSigningIn(true)}>
						Sign in
					</Button>
				</div>
			) : (
				// The editor: context, the text, then one row of controls. The
				// profile: Ask reads and answers; Agent may also run commands (practice)
				<div className="flex select-none flex-col gap-2 border-border border-t bg-card/40 p-2.5">
					<div className="flex flex-wrap gap-1">
						<Chip size="xs">Task</Chip>
						{checks && coach.shared.checks && coach.context.checks && (
							<Chip size="xs" onRemove={() => coach.setContext({ checks: false })}>
								Last check
							</Chip>
						)}
						{coach.shared.cluster && coach.context.cluster && (
							<Chip size="xs" onRemove={() => coach.setContext({ cluster: false })}>
								Cluster
							</Chip>
						)}
					</div>
					<div className="relative">
						<Textarea
							variant="bare"
							value={draft}
							onChange={e => setDraft(e.target.value)}
							onKeyDown={e => {
								if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
									e.preventDefault();
									send(draft);
								}
							}}
							rows={expanded ? 12 : 2}
							placeholder={review ? "Ask Claude about your answer…" : "Ask Claude about this task…"}
							aria-label="Ask the assistant"
							className={cn("select-text pr-7 text-callout", expanded ? "min-h-64" : "max-h-32")}
						/>
						<IconButton
							variant="toolbar"
							size="xs"
							className="absolute top-0 right-0"
							aria-label={expanded ? "Collapse" : "Expand Message Editor"}
							onClick={() => setExpanded(e => !e)}
						>
							{expanded ? <Minimize2 /> : <Maximize2 />}
						</IconButton>
					</div>
					<div className="flex items-center gap-1">
						<Popover>
							<PopoverTrigger asChild>
								<IconButton variant="toolbar" size="xs" aria-label="Add Context">
									<AtSign />
								</IconButton>
							</PopoverTrigger>
							<PopoverContent side="top" className={cn(menu.surface, "w-64")}>
								<div className={menu.header}>Add context</div>
								<ContextRow
									on={coach.context.checks && coach.shared.checks}
									disabled={!checks || !coach.shared.checks}
									label="Last check"
									hint={
										!coach.shared.checks ? "off in Settings" : checks ? undefined : "check first"
									}
									toggle={() => coach.setContext({ checks: !coach.context.checks })}
								/>
								<ContextRow
									on={coach.context.cluster && coach.shared.cluster}
									disabled={!coach.shared.cluster}
									label="Cluster snapshot"
									hint={coach.shared.cluster ? "read-only" : "off in Settings"}
									toggle={() => coach.setContext({ cluster: !coach.context.cluster })}
								/>
							</PopoverContent>
						</Popover>
						<span className="ml-auto" />
						{review ? (
							<span className="text-2xs text-muted-foreground">Ask</span>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<PickerButton aria-label="Profile">
										{coach.profile === "agent" ? "Agent" : "Ask"}
									</PickerButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent side="top" align="end" className="w-56">
									<DropdownMenuRadioGroup
										value={coach.profile}
										onValueChange={v => coach.setProfile(v as Profile)}
									>
										{PROFILES.map(p => (
											<DropdownMenuRadioItem key={p.value} value={p.value} detail={p.detail}>
												{p.name}
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{/* The model, and its effort in a submenu: one picker, as Claude's own apps */}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<PickerButton aria-label="Model and effort" className="min-w-0 shrink">
									{shortName(model, modelName)}
									{effortName && <span className="ml-1 opacity-60">{effortName}</span>}
								</PickerButton>
							</DropdownMenuTrigger>
							<DropdownMenuContent side="top" align="end" className="w-72">
								{coach.models.length === 0 && (
									<div className={cn(menu.content, "py-1 text-muted-foreground text-xs")}>
										Loading models…
									</div>
								)}
								<DropdownMenuRadioGroup value={coach.model} onValueChange={coach.setModel}>
									{coach.models.map(m => (
										<DropdownMenuRadioItem key={m.value} value={m.value} detail={blurb(m)}>
											{shortName(m, m.name)}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
								{coach.efforts.length > 0 && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuSub>
											<DropdownMenuSubTrigger value={effortLabel(coach.effort)}>
												Effort
											</DropdownMenuSubTrigger>
											<DropdownMenuSubContent className="w-64">
												<DropdownMenuLabel className="font-normal text-caption">
													Higher effort means more thorough answers, but takes longer and uses your
													limits faster.
												</DropdownMenuLabel>
												<DropdownMenuRadioGroup
													value={coach.effort}
													onValueChange={coach.setEffort}
												>
													{coach.efforts.map(e => (
														<DropdownMenuRadioItem key={e.value} value={e.value}>
															{effortLabel(e.value, e.name)}
															{e.value === "default" && <Badge variant="tag">Recommended</Badge>}
															{e.value === "max" && (
																<Badge variant="warningTag">
																	<TriangleAlert className="size-3" /> More usage
																</Badge>
															)}
														</DropdownMenuRadioItem>
													))}
												</DropdownMenuRadioGroup>
											</DropdownMenuSubContent>
										</DropdownMenuSub>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
						{usage && (
							<span className="px-1 text-2xs text-muted-foreground tabular-nums">
								{tokens(usage.used)} / {tokens(usage.size)}
							</span>
						)}
						{writing ? (
							<IconButton
								variant="toolbar"
								size="xs"
								className="text-destructive"
								aria-label="Stop"
								onClick={coach.stop}
							>
								<Square className="fill-current" />
							</IconButton>
						) : (
							<IconButton
								variant="toolbar"
								size="xs"
								aria-label="Send"
								disabled={
									!draft.trim() ||
									!!coach.writing ||
									signedOut ||
									(status !== null && !status.ready)
								}
								onClick={() => send(draft)}
							>
								<ArrowUp />
							</IconButton>
						)}
					</div>
				</div>
			)}
		</aside>
	);
}

const Checked = () => (
	<span className={menu.check}>
		<Check className="size-3" />
	</span>
);

const PROFILES: { value: Profile; name: string; detail: string }[] = [
	{ value: "ask", name: "Ask", detail: "Reads the task and answers" },
	{ value: "agent", name: "Agent", detail: "Runs commands you allow" },
];

/**
 * The agent asks to run a command: run it (Enter) or skip it (Escape). What
 * runs unasked is Settings' Tool access, never an "always" given here
 */
function PermissionCard({
	command,
	options,
	onAnswer,
}: {
	command: string;
	options: PermissionOption[];
	onAnswer: (option: string | null) => void;
}) {
	const once = options.find(o => o.kind === "allow_once");
	const reject =
		options.find(o => o.kind === "reject_once") ?? options.find(o => o.kind === "reject_always");
	useEffect(() => {
		// A key already down when the card came (the Enter that sent the
		// message) does not answer it
		const shown = performance.now();
		const keys = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.repeat || performance.now() - shown < 400) return;
			// Not while typing a message (focus stays in the editor after sending)
			const typing = e.target instanceof HTMLTextAreaElement && e.target.value.trim() !== "";
			// Enter on another control (Skip, a field) is that control's
			const control =
				e.target instanceof HTMLElement &&
				(e.target.isContentEditable ||
					e.target.closest("button, a[href], input, select, [role=menuitem], [role=option]") !==
						null);
			if (e.key === "Enter" && once && !typing && !control) {
				e.preventDefault();
				onAnswer(once.id);
			}
			if (e.key === "Escape") {
				e.preventDefault();
				onAnswer(reject?.id ?? null);
			}
		};
		window.addEventListener("keydown", keys);
		return () => window.removeEventListener("keydown", keys);
	}, [once, reject, onAnswer]);
	return (
		<div className="flex flex-col gap-2 border-border border-t bg-card/60 p-3">
			<span className="text-muted-foreground text-xs">Run on the task's host?</span>
			<CodeBlock wrap className="max-h-32">
				$ {command}
			</CodeBlock>
			<div className="flex flex-wrap justify-end gap-1.5">
				<Button size="push" variant="push" onClick={() => onAnswer(reject?.id ?? null)}>
					Skip <kbd className="text-muted-foreground text-xs">esc</kbd>
				</Button>
				{once && (
					<Button size="push" variant="pushDefault" onClick={() => onAnswer(once.id)}>
						Run <kbd className="opacity-70 text-xs">↵</kbd>
					</Button>
				)}
			</div>
		</div>
	);
}

/**
 * The session's name, edited in place: Enter or leaving it keeps it (empty:
 * back to its first question), Escape leaves it as it was
 */
function SessionTitleInput({
	title,
	onDone,
}: {
	title: string;
	onDone: (title: string | null) => void;
}) {
	const done = useRef(false);
	const finish = (next: string | null) => {
		if (done.current) return;
		done.current = true;
		onDone(next);
	};
	return (
		<Input
			autoFocus
			defaultValue={title}
			aria-label="Session name"
			onFocus={e => e.currentTarget.select()}
			onKeyDown={e => {
				if (e.key === "Enter") finish(e.currentTarget.value);
				if (e.key === "Escape") finish(null);
			}}
			onBlur={e => finish(e.currentTarget.value)}
			className="mr-1 h-6 min-w-0 flex-1 select-text rounded-md px-1.5 text-callout md:text-callout"
		/>
	);
}

/** The composer's pickers (model, effort): their value and a chevron */
/** A picker in the editor's row: its value, cut short when the pane is
 * narrow; hovering shows `full` (what the value means) */
function PickerButton({
	children,
	full,
	className,
	...props
}: React.ComponentProps<"button"> & { full?: ReactNode }) {
	return (
		<Button variant="quiet" size="picker" className={cn("shrink-0", className)} {...props}>
			<Truncated full={full} className="max-w-36">
				{children}
			</Truncated>
			<ChevronDown />
		</Button>
	);
}

function ContextRow({
	on,
	label,
	hint,
	disabled,
	toggle,
}: {
	on: boolean;
	label: string;
	hint?: ReactNode;
	disabled?: boolean;
	toggle: () => void;
}) {
	return (
		<button
			type="button"
			className={menuRow()}
			disabled={disabled}
			data-disabled={disabled || undefined}
			onClick={toggle}
		>
			{on && !disabled && <Checked />}
			<span className={menu.label}>{label}</span>
			{hint && <span className={menu.hint}>{hint}</span>}
		</button>
	);
}
