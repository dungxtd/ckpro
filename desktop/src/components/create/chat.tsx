import { Alert } from "@cktry/ui/components/alert";
import { Button } from "@cktry/ui/components/button";
import { IconButton } from "@cktry/ui/components/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@cktry/ui/components/popover";
import { Spinner } from "@cktry/ui/components/spinner";
import { Textarea } from "@cktry/ui/components/textarea";
import { cn } from "@cktry/ui/lib/utils";
import { ArrowUp, History, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Answer, UserMessage } from "@/components/assistant/answer";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import { SignInDialog } from "@/components/assistant/sign-in-dialog";
import { useCoach } from "@/stores/coach";
import { useStudio } from "@/stores/studio";

/** Ways to start, for an empty conversation */
const STARTERS = [
	"A mock exam on the domains I am weakest in",
	"Questions like the ones I got wrong last time, but new",
	"A 60-minute warm-up for my exam day",
];

/**
 * The conversation: what the candidate asks for, Claude's answers as they
 * are written and the tool it is using (it reads the app, and builds the
 * draft beside); the conversations kept, to reopen
 */
export function Chat() {
	const { messages, writing, tool, error, sessions, session } = useStudio();
	const { send, stop, newSession, open, remove } = useStudio.getState();
	const account = useCoach(s => s.account);
	const [signingIn, setSigningIn] = useState(false);
	const [text, setText] = useState("");
	const list = useRef<HTMLDivElement>(null);
	const title = sessions.find(s => s.id === session)?.title ?? "New exam";

	// The latest words in view as they come
	// biome-ignore lint/correctness/useExhaustiveDependencies: follows every message change
	useEffect(() => {
		list.current?.scrollTo({ top: list.current.scrollHeight });
	}, [messages]);

	const submit = (value = text) => {
		if (!value.trim() || writing) return;
		send(value.trim());
		setText("");
	};

	return (
		<section className="flex min-h-0 min-w-0 flex-col">
			<header className="flex items-center gap-2 border-border border-b px-5 py-2.5">
				<ClaudeIcon className="size-4 shrink-0 text-claude" />
				<h2 className="min-w-0 flex-1 truncate font-semibold text-callout">{title}</h2>
				<Popover>
					<PopoverTrigger asChild>
						<IconButton variant="toolbar" size="sm" aria-label="Earlier conversations">
							<History />
						</IconButton>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-80 p-1.5">
						{sessions.length === 0 ? (
							<p className="px-2 py-1.5 text-caption text-muted-foreground">No conversation yet.</p>
						) : (
							sessions.map(s => (
								<div
									key={s.id}
									className={cn(
										"group flex items-center gap-1 rounded-md pr-1 hover:bg-foreground/5",
										s.id === session && "bg-foreground/10"
									)}
								>
									<button
										type="button"
										onClick={() => open(s.id)}
										className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-callout outline-none"
									>
										{s.title}
									</button>
									<IconButton
										variant="toolbar"
										size="xs"
										aria-label={`Delete ${s.title}`}
										className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
										onClick={() => remove(s.id)}
									>
										<Trash2 />
									</IconButton>
								</div>
							))
						)}
					</PopoverContent>
				</Popover>
				<IconButton variant="toolbar" size="sm" aria-label="New conversation" onClick={newSession}>
					<Plus />
				</IconButton>
			</header>

			{/* A readable line however wide the window */}
			<div ref={list} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				<div className="mx-auto flex min-h-full max-w-3xl flex-col gap-3">
					{messages.length === 0 && (
						<div className="m-auto flex max-w-md flex-col items-center gap-3 text-center">
							<ClaudeIcon className="size-7 text-claude" />
							<p className="font-semibold text-lead">What exam do you want?</p>
							<p className="text-callout text-muted-foreground">
								Claude reads your target, your attempts and what you got wrong, your plans and the
								exams here, and builds an exam beside. New questions are proven on a cluster before
								you save.
							</p>
							<div className="mt-1 flex flex-col gap-1.5">
								{STARTERS.map(s => (
									<Button key={s} size="push" variant="push" onClick={() => submit(s)}>
										{s}
									</Button>
								))}
							</div>
						</div>
					)}
					{messages.map((m, i) =>
						m.role === "user" ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: messages only grow
							<UserMessage key={i}>{m.text}</UserMessage>
						) : (
							// biome-ignore lint/suspicious/noArrayIndexKey: messages only grow
							<div key={i} className="flex gap-2.5">
								<ClaudeIcon className="mt-1 size-4 shrink-0 text-claude" />
								{m.text ? (
									<Answer>{m.text}</Answer>
								) : (
									<span className="flex items-center gap-2 text-callout text-muted-foreground">
										<Spinner size="inline" className="size-3.5" /> Thinking…
									</span>
								)}
							</div>
						)
					)}
					{error && <Alert variant="destructive">{error}</Alert>}
				</div>
			</div>

			{tool && (
				<div className="flex items-center gap-2 border-border border-t px-5 py-2 text-muted-foreground text-xs">
					<Spinner size="inline" className="size-3.5" />
					<code className="min-w-0 truncate font-mono">{tool}</code>
				</div>
			)}
			{account?.signed_in === false ? (
				<div className="flex items-center gap-3 border-border border-t px-5 py-3">
					<span className="flex-1 text-muted-foreground text-xs">
						Sign in with your Claude account to build exams with Claude.
					</span>
					<Button size="push" variant="pushDefault" onClick={() => setSigningIn(true)}>
						Sign in
					</Button>
					<SignInDialog open={signingIn} onOpenChange={setSigningIn} />
				</div>
			) : (
				<div className="border-border border-t px-5 py-3">
					<div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring/50">
						<Textarea
							variant="bare"
							rows={2}
							value={text}
							onChange={e => setText(e.target.value)}
							onKeyDown={e => {
								if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
									e.preventDefault();
									submit();
								}
							}}
							placeholder="Say what exam you want, or what to change…"
							aria-label="Message Claude"
							className="max-h-48"
						/>
						{writing ? (
							<IconButton variant="toolbar" size="sm" aria-label="Stop" onClick={stop}>
								<Square />
							</IconButton>
						) : (
							<IconButton
								variant="toolbar"
								size="sm"
								aria-label="Send"
								disabled={!text.trim()}
								onClick={() => submit()}
							>
								<ArrowUp />
							</IconButton>
						)}
					</div>
				</div>
			)}
		</section>
	);
}
