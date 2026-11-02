import { Badge } from "@cktry/ui/components/badge";
import { ConfirmDialog } from "@cktry/ui/components/confirm-dialog";
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
} from "@cktry/ui/components/dropdown-menu";
import { IconButton } from "@cktry/ui/components/icon-button";
import { Input } from "@cktry/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@cktry/ui/components/tooltip";
import { cn } from "@cktry/ui/lib/utils";
import { Ellipsis, Pencil } from "lucide-react";
import { useState } from "react";
import { useStudio } from "@/stores/studio";
import type { ExamDraft } from "@/tauri/api";

/** A domain's colour, by its rank in the exam's weights (tokens: index.css) */
const DOMAIN = ["bg-domain-1", "bg-domain-2", "bg-domain-3", "bg-domain-4", "bg-domain-5"];
const named = (domain: string) => domain.replaceAll("-", " ");
const LENGTHS = [30, 45, 60, 90, 120];

/** The draft's top strip: what it is, and what can be done to it */
export function DraftStrip() {
	const draft = useStudio(s => s.draft);
	if (!draft) return null;
	return (
		<>
			<span className="flex-1 font-bold text-2xs text-muted-foreground tracking-wide">
				{draft.saved ? "SAVED EXAM" : "DRAFT EXAM"}
			</span>
			<DraftMenu />
		</>
	);
}

/** What can be done to the draft: rename it, set its length, clear it */
export function DraftMenu() {
	const draft = useStudio(s => s.draft);
	const edit = useStudio(s => s.edit);
	const setRenaming = useStudio(s => s.setRenaming);
	const [clearing, setClearing] = useState(false);
	if (!draft) return null;
	return (
		<>
			{!draft.saved && draft.certification && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton variant="toolbar" size="xs" aria-label="Draft actions">
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
				description="Every question leaves it, the new ones Claude wrote too. The conversation stays."
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
export function DraftSummary({ className }: { className?: string }) {
	const draft = useStudio(s => s.draft);
	const editing = useStudio(s => s.renaming);
	const setEditing = useStudio(s => s.setRenaming);
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
								{draft.certification.toUpperCase()}
							</Badge>
						)}
						{draft.certification && !draft.saved && (
							<IconButton
								variant="toolbar"
								size="xs"
								aria-label="Rename the exam"
								className="shrink-0"
								onClick={() => setEditing(true)}
							>
								<Pencil />
							</IconButton>
						)}
					</>
				)}
			</div>
			{draft.certification && (
				<div className="flex min-w-0 items-center gap-3 text-caption text-muted-foreground">
					<span className="truncate tabular-nums">
						{items.length} question{items.length === 1 ? "" : "s"}
						{draft.duration_minutes ? ` · ${draft.duration_minutes} min` : ""}
						{minutes > 0 && (
							<span className={cn(over && "text-warning")}> · ~{minutes} min est.</span>
						)}
					</span>
					<Coverage draft={draft} className="ml-auto w-24 shrink-0" />
				</div>
			)}
		</div>
	);
}

/** The exam's questions by domain, coloured, beside the real exam's weights (on hover) */
function Coverage({ draft, className }: { draft: ExamDraft; className?: string }) {
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
			<TooltipContent className="whitespace-normal">
				<div className="flex flex-col gap-1">
					{counts.map((d, i) => (
						<span key={d.domain} className="flex items-center gap-2">
							<span className={cn("size-2 rounded-[2px]", DOMAIN[i % DOMAIN.length])} />
							<span className="flex-1 capitalize">{named(d.domain)}</span>
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
