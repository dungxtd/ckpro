import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { CodeBlock } from "@ckpro/ui/components/code-block";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ckpro/ui/components/dialog";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { cn } from "@ckpro/ui/lib/utils";
import { X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useStudio } from "@/stores/studio";
import type { DraftItem } from "@/tauri/api";
import { ClusterChip } from "./cluster-chip";

const named = (domain: string) => domain.replaceAll("-", " ");

/**
 * The exam being built, beside the conversation: its questions (from the
 * packs, or new ones Claude wrote, each with where it stands), the verify
 * cluster, and the candidate's two steps: prove the new questions (after
 * reading them), then save
 */
export function DraftPanel() {
	const { draft, workspace, verifying } = useStudio();
	const { removeItem, verify, save } = useStudio.getState();
	const navigate = useNavigate();
	const [reviewing, setReviewing] = useState(false);
	// On a narrow window the questions fold under the draft's bar
	const [unfolded, setUnfolded] = useState(false);
	const items = draft?.items ?? [];
	const fresh = items.flatMap(i => (i.kind === "new" ? [i] : []));
	const unproven = fresh.filter(q => q.status.state !== "proven");
	const ready = workspace.state === "ready";

	return (
		<aside className="flex min-h-0 flex-col border-border border-t bg-foreground/[0.015] @3xl:border-t-0 @3xl:border-l">
			{/* As tall as the conversation's header, so their lines meet */}
			<div className="flex h-14 shrink-0 items-center border-border border-b px-4">
				<div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
					<h2 className="truncate font-semibold text-lead">{draft?.title || "Draft exam"}</h2>
					{items.length > 0 && (
						<Button
							size="push"
							variant="push"
							className="@3xl:hidden"
							aria-expanded={unfolded}
							onClick={() => setUnfolded(u => !u)}
						>
							Questions {unfolded ? "▴" : "▾"}
						</Button>
					)}
					{draft?.certification && (
						<span className="shrink-0 text-caption text-muted-foreground">
							{draft.certification.toUpperCase()}
							{draft.duration_minutes ? ` · ${draft.duration_minutes} min` : ""} · {items.length}{" "}
							question{items.length === 1 ? "" : "s"}
						</span>
					)}
				</div>
			</div>

			<div
				className={cn(
					"min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3 @3xl:flex",
					// Narrow: folded, or a part of the height when opened
					unfolded ? "flex max-h-[45vh] @3xl:max-h-none" : "hidden"
				)}
			>
				{items.length === 0 ? (
					<Placeholder
						className="my-auto"
						sample={[1, 2, 3].map(n => (
							<div key={n} className="mb-2 h-14 rounded-lg border border-border bg-card" />
						))}
						title="The exam shows here"
						description="Ask Claude for one: it picks questions and writes new ones"
					/>
				) : (
					items.map(item => (
						<Item key={key(item)} item={item} onRemove={() => removeItem(key(item))} />
					))
				)}
			</div>

			{/* As tall as the composer at rest, so their lines meet; the cluster
			    with what is done on it */}
			<div className="flex min-h-[5.75rem] shrink-0 flex-col justify-center gap-2 border-border border-t px-4 py-3">
				{draft?.saved ? (
					<Button
						size="push"
						variant="pushDefault"
						onClick={() => navigate(`/exams?exam=${encodeURIComponent(draft.saved ?? "")}`)}
					>
						Saved: open the exam
					</Button>
				) : (
					<>
						{unproven.length > 0 && (
							<span className="text-caption text-muted-foreground">
								{unproven.length} new question{unproven.length === 1 ? "" : "s"} to prove on the
								cluster before saving
							</span>
						)}
						<div className="flex items-center gap-2">
							<div className="mr-auto min-w-0">
								<ClusterChip />
							</div>
							{unproven.length > 0 && (
								<Button
									size="push"
									variant="push"
									disabled={!ready || verifying}
									onClick={() => setReviewing(true)}
								>
									{verifying ? "Proving…" : "Review & prove"}
								</Button>
							)}
							<Button
								size="push"
								variant="pushDefault"
								disabled={items.length === 0 || unproven.length > 0 || !draft?.title}
								onClick={save}
							>
								Save exam
							</Button>
						</div>
					</>
				)}
			</div>

			{/* Reading them is the go to run their scripts on the cluster */}
			<Dialog open={reviewing} onOpenChange={setReviewing}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Prove the new questions</DialogTitle>
						<DialogDescription>
							Their setup, checks and solution run on the verify cluster: every check must fail
							before the solution and pass after. Read them first.
						</DialogDescription>
					</DialogHeader>
					<div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
						{unproven.map(q => (
							<div key={q.key} className="flex flex-col gap-1.5">
								<span className="font-semibold text-callout">{q.title}</span>
								<CodeBlock title="yaml" wrap>
									{q.yaml}
								</CodeBlock>
							</div>
						))}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setReviewing(false)}>
							Cancel
						</Button>
						<Button
							onClick={() => {
								setReviewing(false);
								verify();
							}}
						>
							Run on the cluster
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</aside>
	);
}

const key = (item: DraftItem) => (item.kind === "new" ? item.key : item.id);

/** A question of the draft: from the packs, or new and where it stands */
function Item({ item, onRemove }: { item: DraftItem; onRemove: () => void }) {
	const status =
		item.kind === "existing" ? (
			<Badge variant="subtle">From the packs</Badge>
		) : item.status.state === "proven" ? (
			<Badge variant="success">Proven</Badge>
		) : item.status.state === "failed" ? (
			<Badge variant="destructive">Did not prove</Badge>
		) : (
			<Badge variant="warningTag">New · lints</Badge>
		);
	return (
		<div className="group flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2">
			<div className="flex items-start justify-between gap-2">
				<span className="min-w-0 font-medium text-callout">
					{item.title || (item.kind === "existing" ? item.id : "")}
				</span>
				<div className="flex shrink-0 items-center gap-1">
					{status}
					<IconButton
						variant="toolbar"
						size="xs"
						aria-label={`Remove ${item.title}`}
						className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
						onClick={onRemove}
					>
						<X />
					</IconButton>
				</div>
			</div>
			<span className="text-2xs text-muted-foreground capitalize">{named(item.domain)}</span>
			{item.kind === "new" && item.status.state === "failed" && (
				<ul className="list-disc pl-4 text-2xs text-destructive">
					{item.status.problems.slice(0, 4).map(p => (
						<li key={p}>{p}</li>
					))}
				</ul>
			)}
		</div>
	);
}
