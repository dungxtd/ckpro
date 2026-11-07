import { Alert } from "@ckpro/ui/components/alert";
import { Chip } from "@ckpro/ui/components/chip";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { MenuCheck, menu, menuRow } from "@ckpro/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { Spinner } from "@ckpro/ui/components/spinner";
import { Textarea } from "@ckpro/ui/components/textarea";
import { Truncated } from "@ckpro/ui/components/truncated";
import { useFollow } from "@ckpro/ui/hooks/use-follow";
import { cn } from "@ckpro/ui/lib/utils";
import { History, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Answer, UserMessage } from "@/components/assistant/answer";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { SendButton, sendOnEnter } from "@/components/assistant/send-button";
import { SignInBar } from "@/components/assistant/sign-in-bar";
import { useCoach } from "@/stores/coach";
import { running, useStudio } from "@/stores/studio";
import { ToolUses } from "./tool-uses";

/** Ways to start, for an empty conversation */
const STARTERS = [
	"A mock exam on the domains I am weakest in",
	"Questions like the ones I got wrong last time, but new",
	"A 60-minute warm-up for my exam day",
];

/** How much a conversation says: it grows as an answer is written */
const shownLength = (messages: { text: string; tools: unknown[] }[]) =>
	messages.reduce((n, m) => n + m.text.length + m.tools.length + 1, 0);

/**
 * The conversation: what the candidate asks for, Claude's answers as they
 * are written with the tools it used (it reads the app, and builds the
 * draft beside), each opened in place; the conversations kept, to reopen
 */
export function Chat() {
	const messages = useStudio(s => s.messages);
	const pending = useStudio(s => s.pending);
	const last = useStudio(s => s.last);
	const sessions = useStudio(s => s.sessions);
	const session = useStudio(s => s.session);
	const error = useStudio(s => (s.session === null ? undefined : s.errors[s.session]));
	// The answer being written here; others' go on unseen
	const live = session === null ? undefined : pending[session];
	const writing = !!live;
	const shown = live
		? [
				...messages,
				{ role: "user" as const, text: live.asked, tools: [] },
				{ role: "assistant" as const, text: live.text, tools: live.tools },
			]
		: messages;
	const { send, stop, newSession, open, remove } = useStudio.getState();
	const account = useCoach(s => s.account);
	const [text, setText] = useState("");
	// The conversation to delete, once confirmed
	const [deleting, setDeleting] = useState<{ id: number; title: string } | null>(null);
	// The conversations' list: it closes on a pick
	const [listing, setListing] = useState(false);
	// The latest words in view as they come, unless the reader scrolled up
	const written =
		shownLength(messages) + (live ? live.text.length + live.tools.length + live.asked.length : 0);
	const list = useFollow<HTMLDivElement>(written, 160);
	const title = sessions.find(s => s.id === session)?.title ?? "New exam";

	const submit = (value = text) => {
		if (!value.trim() || writing) return;
		send(value.trim());
		setText("");
	};

	return (
		<section className="flex h-full min-h-0 min-w-0 flex-col">
			<header className="flex h-14 shrink-0 items-center gap-2 border-border border-b px-5">
				<AssistantIcon className="size-4 shrink-0 text-assistant" />
				<h2 className="min-w-0 flex-1 truncate font-semibold text-callout">{title}</h2>
				<Popover open={listing} onOpenChange={setListing}>
					<PopoverTrigger asChild>
						<IconButton variant="toolbar" size="sm" aria-label="Earlier conversations">
							<History />
						</IconButton>
					</PopoverTrigger>
					<PopoverContent align="end" className={cn(menu.surface, "w-80")}>
						<div className={menu.header}>Conversations</div>
						{sessions.length === 0 && (
							<div className={cn(menu.content, "py-1 text-muted-foreground text-xs")}>
								No conversation yet
							</div>
						)}
						{sessions.map(s => (
							<div key={s.id} className="group relative">
								<button
									type="button"
									className={cn(menuRow(), "pr-8")}
									onClick={() => {
										setListing(false);
										open(s.id);
									}}
								>
									{s.id === session && <MenuCheck />}
									<Truncated>{s.title}</Truncated>
									{/* Going on there: an answer being written, or its exam being proven */}
									{(pending[s.id] || running({ last }, s.id)) && (
										<span className={menu.hint}>
											{running({ last }, s.id) ? "Proving" : "Writing"}
										</span>
									)}
								</button>
								<IconButton
									variant="toolbar"
									size="xs"
									aria-label={`Delete ${s.title}`}
									className="absolute top-0 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
									onClick={() => {
										setListing(false);
										setDeleting(s);
									}}
								>
									<Trash2 />
								</IconButton>
							</div>
						))}
					</PopoverContent>
				</Popover>
				<IconButton variant="toolbar" size="sm" aria-label="New conversation" onClick={newSession}>
					<Plus />
				</IconButton>
			</header>

			{/* A readable line however wide the window */}
			<div ref={list} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				<div className="mx-auto flex min-h-full max-w-3xl flex-col gap-3">
					{shown.length === 0 && (
						<div className="m-auto flex max-w-md flex-col items-center gap-3 text-center">
							<AssistantIcon className="size-7 text-assistant" />
							<p className="font-semibold text-lead">What exam do you want?</p>
							<p className="text-callout text-muted-foreground">
								The assistant reads your target, your attempts and what you got wrong, your plans
								and the exams here, and builds an exam beside. New questions are proven on a cluster
								before you save.
							</p>
							<div className="mt-1 flex flex-wrap justify-center gap-1.5">
								{STARTERS.map(s => (
									<Chip key={s} onClick={() => submit(s)}>
										{s}
									</Chip>
								))}
							</div>
						</div>
					)}
					{shown.map((m, i) =>
						m.role === "user" ? (
							// biome-ignore lint/suspicious/noArrayIndexKey: messages only grow
							<UserMessage key={i}>{m.text}</UserMessage>
						) : (
							// biome-ignore lint/suspicious/noArrayIndexKey: messages only grow
							<div key={i} className="flex gap-2.5">
								<AssistantIcon className="mt-1 size-4 shrink-0 text-assistant" />
								<div className="flex min-w-0 flex-1 flex-col gap-1.5">
									{/* What it looked at and changed, then what it says */}
									<ToolUses tools={m.tools} />
									{m.text ? (
										<Answer>{m.text}</Answer>
									) : (
										!m.tools.some(t => t.status !== "completed" && t.status !== "failed") && (
											<span className="flex items-center gap-2 text-callout text-muted-foreground">
												<Spinner size="inline" className="size-3.5" /> Thinking…
											</span>
										)
									)}
								</div>
							</div>
						)
					)}
					{error && <Alert variant="destructive">{error}</Alert>}
				</div>
			</div>

			{account?.signed_in === false ? (
				<SignInBar to="build exams" className="px-5" />
			) : (
				<div className="flex min-h-[5.75rem] shrink-0 flex-col justify-center border-border border-t px-5 py-3">
					<div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring/50">
						<Textarea
							variant="bare"
							rows={2}
							value={text}
							onChange={e => setText(e.target.value)}
							onKeyDown={sendOnEnter(() => submit())}
							placeholder="Say what exam you want, or what to change…"
							aria-label="Message the assistant"
							className="max-h-48"
						/>
						<SendButton
							size="sm"
							writing={writing}
							disabled={!text.trim()}
							onSend={() => submit()}
							onStop={stop}
						/>
					</div>
				</div>
			)}
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={o => !o && setDeleting(null)}
				title={`Delete ${deleting?.title ?? "the conversation"}?`}
				description="Its messages and its draft go. An exam saved from it stays. An answer or a proof going on there stops."
				action="Delete"
				onConfirm={() => deleting && remove(deleting.id)}
			/>
		</section>
	);
}
