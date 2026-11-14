import { Button } from "@ckpro/ui/components/button";
import { Chip } from "@ckpro/ui/components/chip";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Input } from "@ckpro/ui/components/input";
import { MenuItem, menu } from "@ckpro/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { Spinner } from "@ckpro/ui/components/spinner";
import { Truncated } from "@ckpro/ui/components/truncated";
import { useFollow } from "@ckpro/ui/hooks/use-follow";
import { cn } from "@ckpro/ui/lib/utils";
import { Ellipsis, History, Plus, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { MASK } from "@/analytics";
import { AGENTS } from "@/components/assistant/agents";
import { Answer, AnswerActions, UserMessage } from "@/components/assistant/answer";
import { AssistantComposer } from "@/components/assistant/assistant-composer";
import { AssistantError } from "@/components/assistant/assistant-error";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { FindInSession } from "@/components/assistant/find-in-session";
import { PermissionCard } from "@/components/assistant/permission-card";
import { SignInBar } from "@/components/assistant/sign-in-bar";
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
import { plural } from "@/words";

/** Ways to start, for an empty conversation: during the attempt, and in
 * its review once it is over */
const STARTERS = {
	attempt: ["What does this task ask for?", "Give me a hint, not the answer"],
	review: ["Why did my checks fail?", "Walk me through a solution"],
};

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
	// What the pane shows and does: not the rest of the store (usage, runtime…)
	const coach = useCoach(
		useShallow(s => ({
			account: s.account,
			ask: s.ask,
			clear: s.clear,
			enabledAgents: s.enabledAgents,
			error: s.error,
			listSessions: s.listSessions,
			load: s.load,
			model: s.model,
			models: s.models,
			newSession: s.newSession,
			openSession: s.openSession,
			permission: s.permission,
			permit: s.permit,
			rename: s.rename,
			running: s.running,
			sessions: s.sessions,
			shown: s.shown,
			titles: s.titles,
			unsent: s.unsent,
			writing: s.writing,
		}))
	);
	const lastCheck = useExam(s => s.checks[question.id]);
	const checks = review?.checks ?? (Array.isArray(lastCheck) ? lastCheck : undefined);
	const messages = coach.sessions[question.id] ?? [];
	const writing = coach.writing === question.id;
	const modelName = coach.models.find(m => m.value === coach.model)?.name ?? coach.model;
	const [status, setStatus] = useState<CoachStatus | null>(null);
	const [history, setHistory] = useState<CoachSession[]>([]);
	const [signingIn, setSigningIn] = useState(false);
	const [renaming, setRenaming] = useState(false);
	// Deleting the conversation, once confirmed
	const [deleting, setDeleting] = useState(false);
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

	useEffect(() => {
		coachApi.status().then(setStatus);
		if (!useCoach.getState().account) useCoach.getState().loadAccount();
	}, []);
	useEffect(() => {
		coach.load(question.id);
	}, [coach.load, question.id]);
	// Follow the answer as it is written (a command's whole output arriving
	// at once too), unless the reader scrolled up
	const written = messages.reduce((n, m) => n + m.text.length + 1, 0);
	const scroller = useFollow<HTMLDivElement>(written, 160);
	// Cmd+F finds in the session: the pane, and its messages
	const pane = useRef<HTMLElement>(null);
	const found = useRef<HTMLDivElement>(null);

	const send = (text: string) => {
		const t = text.trim();
		if (!t || coach.writing) return false;
		coach.ask(question.id, t);
		return true;
	};
	const title =
		coach.titles[question.id] ?? messages.find(m => m.role === "user")?.text ?? "New conversation";
	const lastUser = [...messages].reverse().find(m => m.role === "user")?.text;

	return (
		// The candidate's messages, the answers, session names, the login:
		// replays show none of their text
		<aside
			ref={pane}
			className={cn("flex h-full w-full min-w-0 flex-col overflow-hidden bg-background", MASK)}
		>
			{/* Toolbar: the session (double-click to rename), then new, history, more, close */}
			<div className="flex h-9 shrink-0 items-center gap-0.5 border-border border-b pr-1.5 pl-3">
				{renaming ? (
					<SessionTitleInput
						title={title}
						onDone={next => {
							setRenaming(false);
							if (next !== null && next !== title) coach.rename(question.id, next);
						}}
					/>
				) : (
					// Double-click: a mouse shortcut; More > Rename conversation… is the keyboard way
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
							aria-label="New conversation"
							disabled={writing || messages.length === 0 || agents.length === 0}
						>
							<Plus />
						</IconButton>
					</PopoverTrigger>
					<PopoverContent align="end" variant="menu" className="w-56">
						<div className={menu.header}>New conversation with</div>
						{agents.map(a => (
							<MenuItem
								key={a.id}
								icon={<a.Icon className={cn("size-3.5! shrink-0", a.tint)} />}
								onClick={() => {
									setOpen(null);
									coach.newSession(question.id);
								}}
							>
								{a.name}
							</MenuItem>
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
					<PopoverContent align="end" variant="menu" className="w-72">
						<div className={menu.header}>This attempt</div>
						{history.length === 0 && (
							<div className={cn(menu.content, "py-1 text-muted-foreground text-caption")}>
								No conversations yet
							</div>
						)}
						{history.map(t => (
							<MenuItem
								key={`${t.question_id}/${t.session}`}
								// An answer being written: switching would end its session
								disabled={!!coach.writing}
								checked={t.question_id === question.id && t.session === coach.shown[question.id]}
								// A question and its answer to each exchange; one asked
								// and not yet answered counts too
								hint={
									<span className="tabular-nums">
										{plural(Math.ceil(t.messages / 2), "question")}
									</span>
								}
								onClick={() => {
									setOpen(null);
									onOpenQuestion?.(t.question_id);
									coach.openSession(t.question_id, t.session);
								}}
							>
								<Truncated>{t.title}</Truncated>
							</MenuItem>
						))}
					</PopoverContent>
				</Popover>
				<Popover {...menuOf("more")}>
					<PopoverTrigger asChild>
						<IconButton variant="toolbar" size="xs" aria-label="More">
							<Ellipsis />
						</IconButton>
					</PopoverTrigger>
					<PopoverContent align="end" variant="menu" className="w-60">
						<div className={menu.header}>Claude account</div>
						{coach.account?.signed_in ? (
							<div className={cn(menu.content, "flex flex-col py-1 text-caption")}>
								<span className="truncate">{coach.account.email ?? "Signed in"}</span>
								<span className="text-muted-foreground capitalize">
									{coach.account.method === "console"
										? "Anthropic Console"
										: `Claude ${coach.account.plan ?? "subscription"}`}
								</span>
							</div>
						) : (
							<MenuItem disabled={!coach.account} onClick={() => setSigningIn(true)}>
								{coach.account ? "Sign in…" : "Checking…"}
							</MenuItem>
						)}
						<div className={menu.separator} />
						<MenuItem
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
										() => toast.success("Conversation copied as Markdown", { duration: 1500 }),
										() => toast.error("Could not copy the conversation")
									);
							}}
						>
							Copy conversation as Markdown
						</MenuItem>
						<MenuItem
							disabled={messages.length === 0}
							onClick={() => {
								setOpen(null);
								setRenaming(true);
							}}
						>
							Rename conversation…
						</MenuItem>
						<div className={menu.separator} />
						<MenuItem
							disabled={writing || messages.length === 0}
							onClick={() => {
								setOpen(null);
								setDeleting(true);
							}}
						>
							Delete conversation
						</MenuItem>
					</PopoverContent>
				</Popover>
				{onClose && (
					<IconButton variant="toolbar" size="xs" aria-label="Close" onClick={onClose}>
						<X />
					</IconButton>
				)}
			</div>

			<FindInSession area={pane} messages={found} version={written} />
			<div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
				{messages.length === 0 ? (
					// Quiet: Claude's mark, one line and ways to start (when there
					// is someone to ask), and what is needed (Docker); signing in
					// takes the editor's place
					<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
						<AssistantIcon className="size-8 text-assistant opacity-80" />
						<p className="text-callout text-muted-foreground">
							{review ? "Ask about this task and how it went." : "Ask about this task."}
						</p>
						{claudeOn && !signedOut && (status === null || status.ready) && (
							<div className="flex flex-wrap justify-center gap-1.5">
								{(review ? STARTERS.review : STARTERS.attempt).map(s => (
									<Chip key={s} disabled={writing} onClick={() => send(s)}>
										{s}
									</Chip>
								))}
							</div>
						)}
						{status && !status.ready && (
							<span className="text-muted-foreground text-caption">{status.problem}</span>
						)}
					</div>
				) : (
					<div ref={found} className="flex flex-col">
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
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
									key={i}
									data-answer
									className="group/answer my-1 flex min-w-0 flex-col gap-1.5 px-2"
								>
									{/* The assistant's mark; while it answers, a spinner beside it (and what it
									    does before its first words) */}
									<div className="flex h-4 items-center gap-1.5 text-2xs text-muted-foreground">
										<AssistantIcon className="size-3.5 text-assistant" />
										{writing && i === messages.length - 1 && (
											<>
												<Spinner size="inline" className="size-3" />
												{!m.text && <span>Thinking…</span>}
											</>
										)}
									</div>
									{m.text && <Answer>{m.text}</Answer>}
									{m.text && !(writing && i === messages.length - 1) && (
										<AnswerActions text={m.text}>
											{/* The last answer can be asked again */}
											{i === messages.length - 1 && lastUser && (
												<>
													<Button variant="quiet" size="inline" onClick={() => send(lastUser)}>
														<RotateCw /> Regenerate
													</Button>
													<span className="opacity-60">{modelName}</span>
												</>
											)}
										</AnswerActions>
									)}
								</div>
							)
						)}
					</div>
				)}
				{coach.error && (
					<AssistantError
						size="sm"
						className="mt-2"
						error={coach.error}
						onRetry={
							coach.unsent?.questionId === question.id
								? () => coach.unsent && send(coach.unsent.text)
								: undefined
						}
					/>
				)}
				<SignInDialog open={signingIn} onOpenChange={setSigningIn} />
			</div>

			{/* What the agent is doing (Agent): the command running, or one it asks to run */}
			{coach.permission?.questionId === question.id ? (
				<PermissionCard
					command={coach.permission.command}
					tool={coach.permission.tool}
					options={coach.permission.options}
					onAnswer={coach.permit}
				/>
			) : (
				coach.running?.questionId === question.id && (
					<div className="flex items-center gap-2 border-border border-t px-3 py-2 text-muted-foreground text-caption">
						<Spinner size="inline" className="size-3.5" />
						<code className="min-w-0 truncate font-mono">$ {coach.running.command}</code>
					</div>
				)
			)}

			{!claudeOn ? (
				// No agent turned on: nothing to ask
				<div className="flex items-center gap-3 border-border border-t bg-card/40 px-3 py-3 text-muted-foreground text-caption">
					No agent is turned on. Turn one on in Settings › Assistant.
				</div>
			) : signedOut ? (
				// Signed out: the place to type becomes the way in
				<SignInBar to="ask about this task" className="px-3" />
			) : (
				<AssistantComposer
					questionId={question.id}
					review={!!review}
					checks={checks}
					ready={status === null || status.ready}
					onSend={send}
				/>
			)}
			<ConfirmDialog
				open={deleting}
				onOpenChange={setDeleting}
				title="Delete this conversation?"
				description="Its messages go, and cannot be brought back."
				action="Delete"
				onConfirm={() => coach.clear(question.id)}
			/>
		</aside>
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
			aria-label="Conversation name"
			onFocus={e => e.currentTarget.select()}
			onKeyDown={e => {
				if (e.key === "Enter") finish(e.currentTarget.value);
				if (e.key === "Escape") finish(null);
			}}
			onBlur={e => finish(e.currentTarget.value)}
			className="mr-1 h-6 min-w-0 flex-1 select-text px-1.5 text-callout md:text-callout"
		/>
	);
}
