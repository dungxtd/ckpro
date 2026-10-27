import { menu, menuRow } from "@ckdry/ui/components/menu";
import { Spinner } from "@ckdry/ui/components/spinner";
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
	Sparkles,
	Square,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCoach } from "@/stores/coach";
import { useExam } from "@/stores/exam";
import {
	type CheckResult,
	type CoachStatus,
	type CoachThread,
	coachApi,
	type QuestionView,
} from "@/tauri/api";
import { Answer } from "./answer";

type Menu = "history" | "more" | "context" | "model" | null;

const tokens = (n: number) =>
	n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

/**
 * The assistant, laid out like Zed's agent panel: one read-only agent (ACP,
 * Claude) and one conversation per question. It reads the task and,
 * as chosen with @, the last check and a look at the cluster; it never runs
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
	const thread = coach.threads[question.id] ?? [];
	const writing = coach.writing === question.id;
	const usage = coach.usage[question.id];
	const [status, setStatus] = useState<CoachStatus | null>(null);
	const [draft, setDraft] = useState("");
	const [open, setOpen] = useState<Menu>(null);
	const [expanded, setExpanded] = useState(false);
	const [history, setHistory] = useState<CoachThread[]>([]);
	const scroller = useRef<HTMLDivElement>(null);

	useEffect(() => {
		coachApi.status().then(setStatus);
	}, []);
	useEffect(() => {
		coach.load(question.id);
	}, [coach.load, question.id]);
	// Follow the answer as it is written, unless the reader scrolled up
	const written = thread.reduce((n, m) => n + m.text.length + 1, 0);
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
	const toggle = (menuName: Menu) => setOpen(m => (m === menuName ? null : menuName));
	// A menu closes on Escape or a click outside it (its own button toggles it)
	useEffect(() => {
		if (!open) return;
		const outside = (e: PointerEvent) => {
			const target = e.target as Element | null;
			if (!target?.closest("[data-popup], [data-popup-toggle]")) setOpen(null);
		};
		const onEscape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", onEscape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", onEscape);
		};
	}, [open]);
	const title = thread.find(m => m.role === "user")?.text ?? "New Thread";
	const lastUser = [...thread].reverse().find(m => m.role === "user")?.text;

	return (
		<aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background">
			{/* Toolbar: the thread, then new, history, more, close */}
			<div className="relative flex h-9 shrink-0 items-center gap-0.5 border-border border-b pr-1.5 pl-3">
				<span className="min-w-0 flex-1 truncate text-[13px]" title={title}>
					{title}
				</span>
				<ToolButton
					label="New Thread"
					onClick={() => coach.clear(question.id)}
					disabled={writing || thread.length === 0}
				>
					<Plus />
				</ToolButton>
				<ToolButton
					toggles
					label="History"
					onClick={() => {
						coach.listThreads().then(setHistory);
						toggle("history");
					}}
				>
					<History />
				</ToolButton>
				<ToolButton toggles label="More" onClick={() => toggle("more")}>
					<Ellipsis />
				</ToolButton>
				{onClose && (
					<ToolButton label="Close" onClick={onClose}>
						<X />
					</ToolButton>
				)}
				{open === "history" && (
					<Popup className="top-8 right-2 w-72">
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
								{t.question_id === question.id && (
									<span className={menu.check}>
										<Check className="size-3" />
									</span>
								)}
								<span className="truncate">{t.title}</span>
								<span className={menu.hint}>{t.messages / 2}</span>
							</button>
						))}
					</Popup>
				)}
				{open === "more" && (
					<Popup className="top-8 right-2 w-56">
						<button
							type="button"
							className={menuRow()}
							disabled={thread.length === 0}
							onClick={() => {
								navigator.clipboard.writeText(
									thread
										.map(m => `${m.role === "user" ? "## You" : "## Assistant"}\n\n${m.text}`)
										.join("\n\n")
								);
								toast.success("Thread copied as Markdown", { duration: 1500 });
								setOpen(null);
							}}
						>
							Copy Thread as Markdown
						</button>
						<div className={menu.separator} />
						<button
							type="button"
							className={menuRow()}
							disabled={writing || thread.length === 0}
							onClick={() => {
								coach.clear(question.id);
								setOpen(null);
							}}
						>
							Clear Thread
						</button>
					</Popup>
				)}
			</div>

			<div
				ref={scroller}
				className="min-h-0 flex-1 select-text overflow-y-auto overflow-x-hidden p-2"
			>
				{thread.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
						<Sparkles className="size-9 text-muted-foreground/70" strokeWidth={1.5} />
						<span className="font-semibold text-[15px]">
							{review ? "Review this task with AI" : "Ask AI about this task"}
						</span>
						<span className="text-muted-foreground text-xs">
							{status && !status.ready
								? status.problem
								: "It reads the task, your last check and the cluster, and answers. It never runs anything. Answers may be inaccurate."}
						</span>
					</div>
				) : (
					<div className="flex flex-col">
						{thread.map((m, i) =>
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
									<span className="self-end font-medium text-[10px] text-muted-foreground">
										You
									</span>
									<span className="whitespace-pre-wrap text-[13px]">{m.text}</span>
								</div>
							) : (
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
								<div key={i} className="my-1 flex min-w-0 flex-col gap-1.5 px-2">
									<Sparkles className="size-3 text-muted-foreground" />
									{m.text ? (
										<Answer>{m.text}</Answer>
									) : (
										<Spinner size="inline" className="size-3.5 text-muted-foreground" />
									)}
									{m.text && !writing && i === thread.length - 1 && lastUser && (
										<div className="flex items-center gap-2 text-[10px] text-muted-foreground">
											<button
												type="button"
												className="flex cursor-pointer items-center gap-1 hover:text-foreground"
												onClick={() => send(lastUser)}
											>
												<RotateCw className="size-3" /> Regenerate
											</button>
											<span className="opacity-60">{coach.model}</span>
										</div>
									)}
								</div>
							)
						)}
					</div>
				)}
				{coach.error && (
					<div className="mt-2 flex gap-2 rounded-md bg-warning/10 px-3 py-1.5 text-muted-foreground text-xs">
						<span className="flex-1">{coach.error}</span>
					</div>
				)}
			</div>

			{/* Message editor: context, the text, then one row of controls. The
			    profile is fixed to Ask (read-only), so it is text */}
			<div className="relative flex flex-col gap-2 border-border border-t bg-card/40 p-2.5">
				<div className="flex flex-wrap gap-1">
					<ContextChip>Task</ContextChip>
					{checks && coach.context.checks && (
						<ContextChip onRemove={() => coach.setContext({ checks: false })}>
							Last check
						</ContextChip>
					)}
					{coach.context.cluster && (
						<ContextChip onRemove={() => coach.setContext({ cluster: false })}>Cluster</ContextChip>
					)}
				</div>
				<div className="relative">
					<textarea
						value={draft}
						onChange={e => setDraft(e.target.value)}
						onKeyDown={e => {
							if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
								e.preventDefault();
								send(draft);
							}
						}}
						rows={expanded ? 12 : 2}
						placeholder="Ask about this task…"
						aria-label="Ask the assistant"
						className="block w-full resize-none bg-transparent pr-7 text-[13px] outline-none placeholder:text-muted-foreground/70"
					/>
					<ToolButton
						label={expanded ? "Collapse" : "Expand Message Editor"}
						className="absolute top-0 right-0"
						onClick={() => setExpanded(e => !e)}
					>
						{expanded ? <Minimize2 /> : <Maximize2 />}
					</ToolButton>
				</div>
				<div className="relative flex items-center gap-1">
					<ToolButton toggles label="Add Context" onClick={() => toggle("context")}>
						<AtSign />
					</ToolButton>
					{open === "context" && (
						<Popup className="bottom-8 left-0 w-60">
							<div className={menu.header}>Add context</div>
							<ContextRow
								on={coach.context.checks}
								disabled={!checks}
								label="Last check"
								hint={checks ? undefined : "run Check my work"}
								toggle={() => coach.setContext({ checks: !coach.context.checks })}
							/>
							<ContextRow
								on={coach.context.cluster}
								label="Cluster snapshot"
								hint="read-only"
								toggle={() => coach.setContext({ cluster: !coach.context.cluster })}
							/>
						</Popup>
					)}
					<span className="ml-auto text-[11px] text-muted-foreground">Ask</span>
					<span className="relative">
						<button
							type="button"
							data-popup-toggle
							className="flex cursor-pointer items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground capitalize hover:bg-foreground/5 hover:text-foreground"
							onClick={() => toggle("model")}
						>
							{coach.model} <ChevronDown className="size-3" />
						</button>
						{open === "model" && (
							<Popup className="right-0 bottom-7 w-40">
								{coach.models.map((m, i) => (
									<button
										key={m}
										type="button"
										className={cn(menuRow(), "capitalize")}
										onClick={() => {
											coach.setModel(m);
											setOpen(null);
										}}
									>
										{coach.model === m && (
											<span className={menu.check}>
												<Check className="size-3" />
											</span>
										)}
										{m}
										{i === 0 && <span className={cn(menu.hint, "normal-case")}>default</span>}
									</button>
								))}
							</Popup>
						)}
					</span>
					{usage && (
						<span
							className="px-1 text-[11px] text-muted-foreground tabular-nums"
							title="Context used"
						>
							{tokens(usage.used)} / {tokens(usage.size)}
						</span>
					)}
					{writing ? (
						<ToolButton label="Stop" className="text-destructive" onClick={coach.stop}>
							<Square className="fill-current" />
						</ToolButton>
					) : (
						<ToolButton
							label="Send"
							disabled={!draft.trim() || !!coach.writing || (status !== null && !status.ready)}
							onClick={() => send(draft)}
						>
							<ArrowUp />
						</ToolButton>
					)}
				</div>
			</div>
		</aside>
	);
}

/** Zed's small icon buttons: no frame, a tint on hover */
function ToolButton({
	label,
	className,
	disabled,
	onClick,
	toggles,
	children,
}: {
	label: string;
	className?: string;
	disabled?: boolean;
	onClick?: () => void;
	/** Opens a menu */
	toggles?: boolean;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			data-popup-toggle={toggles || undefined}
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-3.5",
				className
			)}
		>
			{children}
		</button>
	);
}

const Popup = ({ className, children }: { className: string; children: ReactNode }) => (
	<div data-popup className={cn(menu.surface, "absolute z-20", className)}>
		{children}
	</div>
);

const ContextChip = ({ onRemove, children }: { onRemove?: () => void; children: ReactNode }) => (
	<span className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px]">
		{children}
		{onRemove && (
			<button
				type="button"
				aria-label={`Remove ${children}`}
				className="cursor-pointer text-muted-foreground hover:text-foreground"
				onClick={onRemove}
			>
				<X className="size-3" />
			</button>
		)}
	</span>
);

const ContextRow = ({
	on,
	label,
	hint,
	disabled,
	toggle,
}: {
	on: boolean;
	label: string;
	hint?: string;
	disabled?: boolean;
	toggle: () => void;
}) => (
	<button
		type="button"
		className={menuRow()}
		disabled={disabled}
		data-disabled={disabled || undefined}
		onClick={toggle}
	>
		{on && !disabled && (
			<span className={menu.check}>
				<Check className="size-3" />
			</span>
		)}
		{label}
		{hint && <span className={menu.hint}>{hint}</span>}
	</button>
);
