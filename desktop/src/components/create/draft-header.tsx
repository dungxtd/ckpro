import { Alert } from "@ckpro/ui/components/alert";
import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { ConfirmDialog } from "@ckpro/ui/components/confirm-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@ckpro/ui/components/dropdown-menu";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Input } from "@ckpro/ui/components/input";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { Spinner } from "@ckpro/ui/components/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ckpro/ui/components/tooltip";
import { cn } from "@ckpro/ui/lib/utils";
import { Check, Ellipsis, Pencil, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { useProving, useStudio } from "@/stores/studio";
import type { ExamDraft } from "@/tauri/api";
import { certName, domainName, plural } from "@/words";

/** A domain's colour, by its rank in the exam's weights (tokens: index.css) */
const DOMAIN = ["bg-domain-1", "bg-domain-2", "bg-domain-3", "bg-domain-4", "bg-domain-5"];
const LENGTHS = [30, 45, 60, 90, 120];

/**
 * The draft's top strip: whether it was saved, or once it has questions its two views
 * (the questions, the proof's steps), and what can be done to it
 */
export function DraftStrip() {
	const draft = useStudio(s => s.draft);
	// Once it has questions: its two views
	const tabs = (draft?.items.length ?? 0) > 0;
	return (
		<>
			{tabs ? (
				<span className="flex-1">
					<ProofTabs />
				</span>
			) : (
				// Its name shows under it: only whether it was saved
				<span className="flex-1">{draft?.saved && <Badge variant="success">Saved</Badge>}</span>
			)}
			<DraftMenu />
		</>
	);
}

/**
 * Exam | Proof: the questions, or the proof's steps (those to come before
 * the first); Proof says how one goes (k of n, a spinner) or how it ended
 * (✓ or ✗)
 */
export function ProofTabs() {
	const tab = useStudio(s => s.tab);
	const setTab = useStudio(s => s.setTab);
	const proof = useStudio(s => (s.session === null ? undefined : s.last[s.session]));
	const items = useStudio(s => s.draft?.items.length ?? 0);
	if (items === 0) return null;
	const failed = proof?.results.some(r => r.status.state === "failed");
	const state = !proof ? null : !proof.ended_at ? (
		<>
			<Spinner size="inline" className="size-3" />
			<span className="tabular-nums">
				{proof.results.length}/{proof.checking.length}
			</span>
		</>
	) : failed || proof.results.length < proof.checking.length ? (
		<X className="size-3.5 text-destructive" />
	) : (
		<Check className="size-3.5 text-success" />
	);
	return (
		<SegmentedControl
			label="Show"
			value={tab}
			onChange={setTab}
			options={[
				{ value: "exam", label: "Exam" },
				{
					value: "proof",
					label: <span className="flex items-center gap-1.5">Proof {state}</span>,
				},
			]}
		/>
	);
}

/** What can be done to the draft: rename it, set its length, clear it */
export function DraftMenu() {
	const draft = useStudio(s => s.draft);
	const edit = useStudio(s => s.edit);
	const proving = useProving();
	const setRenaming = useStudio(s => s.setRenaming);
	const [clearing, setClearing] = useState(false);
	if (!draft) return null;
	return (
		<>
			{!draft.saved && draft.certification && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton
							variant="toolbar"
							size="xs"
							aria-label={
								proving ? "Draft actions (while it is proven, it stays as it is)" : "Draft actions"
							}
							disabled={proving}
						>
							<Ellipsis />
						</IconButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => setRenaming(true)}>Rename…</DropdownMenuItem>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>Length</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={String(draft.duration_minutes ?? "")}
									onValueChange={v => edit({ duration: Number(v) })}
								>
									{LENGTHS.map(m => (
										<DropdownMenuRadioItem key={m} value={String(m)}>
											{m} min
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
						<DropdownMenuItem className="text-destructive" onSelect={() => setClearing(true)}>
							Clear the draft…
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			<ConfirmDialog
				open={clearing}
				onOpenChange={setClearing}
				title="Clear the draft?"
				description="Every question leaves it, the new ones the assistant wrote too. The conversation stays."
				action="Clear"
				onConfirm={() => edit({ clear: true })}
			/>
		</>
	);
}

/**
 * The draft as it stands: its whole name (to edit), its certification, and
 * its measures: questions, length, the time its questions suggest (orange
 * past the length) and its domains against the real exam's weights
 */
export function DraftSummary({
	trailing,
	className,
}: {
	/** At the end of its title's line (the bar's tabs and menu), so its
	 * measures' line, coverage at the end, sits under them */
	trailing?: ReactNode;
	className?: string;
}) {
	const draft = useStudio(s => s.draft);
	const editing = useStudio(s => s.renaming);
	const setEditing = useStudio(s => s.setRenaming);
	const proving = useProving();
	if (!draft) return null;
	const items = draft.items;
	const minutes = items.reduce((sum, i) => sum + (i.minutes ?? 0), 0);
	const over = !!draft.duration_minutes && minutes > draft.duration_minutes;
	return (
		<div className={cn("flex min-w-0 flex-col justify-center gap-1", className)}>
			<div className="flex min-w-0 items-center gap-1.5">
				{editing ? (
					<TitleInput draft={draft} onDone={() => setEditing(false)} />
				) : (
					<>
						<h2 className="truncate font-bold text-lead" title={draft.title || undefined}>
							{draft.title || "Draft exam"}
						</h2>
						{draft.certification && (
							<Badge variant="subtle" className="shrink-0">
								{certName(draft.certification)}
							</Badge>
						)}
						{draft.certification && !draft.saved && (
							<IconButton
								variant="toolbar"
								size="xs"
								aria-label="Rename the exam"
								disabled={proving}
								className="shrink-0"
								onClick={() => setEditing(true)}
							>
								<Pencil />
							</IconButton>
						)}
					</>
				)}
				{trailing && (
					<div className="ml-auto flex shrink-0 items-center gap-2 pl-2">{trailing}</div>
				)}
			</div>
			{draft.certification && (
				<div className="flex min-w-0 items-center gap-3 text-caption text-muted-foreground">
					<span className="truncate tabular-nums">
						{plural(items.length, "question")}
						{draft.duration_minutes ? ` · ${draft.duration_minutes} min` : ""}
						{minutes > 0 && (
							<span className={cn(over && "text-warning")}> · ~{minutes} min est.</span>
						)}
					</span>
					<Coverage
						draft={draft}
						// In the bar it opens over the questions, not over its own tabs
						side={trailing ? "bottom" : "top"}
						className={cn("ml-auto shrink-0", trailing ? "w-32" : "w-24")}
					/>
				</div>
			)}
		</div>
	);
}

/** The exam's questions by domain, coloured, beside the real exam's weights (on hover) */
function Coverage({
	draft,
	side,
	className,
}: {
	draft: ExamDraft;
	side: "top" | "bottom";
	className?: string;
}) {
	const counts = draft.domains.map(d => ({
		...d,
		count: draft.items.filter(i => i.domain === d.domain).length,
	}));
	const total = counts.reduce((s, d) => s + d.count, 0);
	if (!total) return null;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					role="img"
					aria-label="Domain coverage"
					className={cn("flex h-1.5 overflow-hidden rounded-full bg-foreground/10", className)}
				>
					{counts.map((d, i) =>
						d.count ? (
							<span
								key={d.domain}
								className={DOMAIN[i % DOMAIN.length]}
								style={{ width: `${(d.count * 100) / total}%` }}
							/>
						) : null
					)}
				</div>
			</TooltipTrigger>
			<TooltipContent side={side} align="end" className="whitespace-normal">
				<div className="flex flex-col gap-1">
					{counts.map((d, i) => (
						<span key={d.domain} className="flex items-center gap-2">
							<span className={cn("size-2 rounded-xs", DOMAIN[i % DOMAIN.length])} />
							<span className="flex-1 capitalize">{domainName(d.domain)}</span>
							<span className="tabular-nums">
								{d.count} · {Math.round((d.count * 100) / total)}% (exam {d.weight}%)
							</span>
						</span>
					))}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

function TitleInput({ draft, onDone }: { draft: ExamDraft; onDone: () => void }) {
	const edit = useStudio(s => s.edit);
	const [title, setTitle] = useState(draft.title);
	const done = (save: boolean) => {
		if (save && title.trim() && title !== draft.title) edit({ title });
		onDone();
	};
	return (
		<Input
			// Renaming starts typing
			autoFocus
			aria-label="Exam title"
			value={title}
			onChange={e => setTitle(e.target.value)}
			onKeyDown={e => {
				if (e.key === "Enter") done(true);
				if (e.key === "Escape") done(false);
			}}
			onBlur={() => done(true)}
			className="h-7"
		/>
	);
}

/**
 * How the questions' time fits the exam's length, when it does not: more
 * than the length, or under half of it, and the steps from there (a length
 * that holds them, the assistant to trim or add)
 */
export function LengthFit() {
	const draft = useStudio(s => s.draft);
	const edit = useStudio(s => s.edit);
	const send = useStudio(s => s.send);
	const proving = useProving();
	if (!draft || draft.saved || !draft.duration_minutes) return null;
	const length = draft.duration_minutes;
	const minutes = draft.items.reduce((sum, i) => sum + (i.minutes ?? 0), 0);
	const over = minutes > length;
	if (minutes === 0 || (!over && minutes * 2 >= length)) return null;
	// The shortest length that holds them, if it is another
	const fits = LENGTHS.find(m => m >= minutes);
	return (
		// More than the length is a warning; under half of it, a note
		<Alert variant={over ? "warning" : "info"} size="sm" className="shrink-0 flex-col py-2.5">
			<span className={over ? "text-warning" : "text-muted-foreground"}>
				{over
					? `~${minutes} min of questions: more than the ${length} minutes`
					: `~${minutes} min of questions: under half the ${length} minutes`}
			</span>
			<div className="flex flex-wrap gap-2">
				{fits && fits !== length && (
					<Button
						size="push"
						variant="push"
						disabled={proving}
						onClick={() => edit({ duration: fits })}
					>
						Set to {fits} min
					</Button>
				)}
				<Button
					size="push"
					variant="assistant"
					disabled={proving}
					onClick={() =>
						send(
							over
								? `Trim the exam to fit ${length} minutes: about ${minutes} minutes of questions now.`
								: `Add questions to fill ${length} minutes: about ${minutes} minutes of questions now.`
						)
					}
				>
					<AssistantIcon />
					{over ? "Ask to trim it" : "Ask for more"}
				</Button>
			</div>
		</Alert>
	);
}
