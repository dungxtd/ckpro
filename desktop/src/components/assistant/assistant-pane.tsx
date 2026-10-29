import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Input } from "@ckdry/ui/components/input";
import { menu, menuRow } from "@ckdry/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckdry/ui/components/popover";
import { Spinner } from "@ckdry/ui/components/spinner";
import { Truncated } from "@ckdry/ui/components/truncated";
import { cn } from "@ckdry/ui/lib/utils";
import { Check, Ellipsis, History, Plus, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MASK } from "@/analytics";
import { AGENTS } from "@/components/assistant/agents";
import { Answer, UserMessage } from "@/components/assistant/answer";
import { AssistantComposer } from "@/components/assistant/assistant-composer";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import { PermissionCard } from "@/components/assistant/permission-card";
import { SignInDialog } from "@/components/assistant/sign-in-dialog";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import {
	type CheckResult,
	type CoachSession,
	type CoachStatus,
	coachApi,
	type QuestionView,
} from "@/tauri/api";

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
	const modelName = coach.models.find(m => m.value === coach.model)?.name ?? coach.model;
	const [status, setStatus] = useState<CoachStatus | null>(null);
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
		if (!t || coach.writing) return false;
		coach.ask(question.id, t, review?.checks);
		return true;
	};
	const title =
		coach.titles[question.id] ?? messages.find(m => m.role === "user")?.text ?? "New Session";
	const lastUser = [...messages].reverse().find(m => m.role === "user")?.text;

	return (
		// The candidate's messages, the answers, session names, the login:
		// replays show none of their text
		<aside
			className={cn("flex h-full w-full min-w-0 flex-col overflow-hidden bg-background", MASK)}
		>
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
									coach.newSession(question.id);
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
								key={`${t.question_id}/${t.session}`}
								type="button"
								className={menuRow()}
								onClick={() => {
									setOpen(null);
									onOpenQuestion?.(t.question_id);
									coach.openSession(t.question_id, t.session);
								}}
							>
								{t.question_id === question.id && t.session === coach.shown[question.id] && (
									<Checked />
								)}
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
							Delete Session
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
								<UserMessage
									// Messages only grow at the end
									// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
									key={i}
									className={i > 0 ? "mt-5" : undefined}
								>
									{m.text}
								</UserMessage>
							) : (
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
								<div key={i} className="my-1 flex min-w-0 flex-col gap-1.5 px-2">
									{/* Claude's mark; while it answers, a spinner beside it (and what it
									    does before its first words) */}
									<div className="flex h-4 items-center gap-1.5 text-2xs text-muted-foreground">
										<ClaudeIcon className="size-3.5 text-claude" />
										{writing && i === messages.length - 1 && (
											<>
												<Spinner size="inline" className="size-3" />
												{!m.text && <span>Thinking…</span>}
											</>
										)}
									</div>
									{m.text && <Answer>{m.text}</Answer>}
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
				<AssistantComposer
					questionId={question.id}
					review={!!review}
					checks={checks}
					ready={status === null || status.ready}
					onSend={send}
				/>
			)}
		</aside>
	);
}

const Checked = () => (
	<span className={menu.check}>
		<Check className="size-3" />
	</span>
);

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
