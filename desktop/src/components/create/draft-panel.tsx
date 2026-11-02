import { Badge } from "@cktry/ui/components/badge";
import { Button } from "@cktry/ui/components/button";
import { CodeBlock } from "@cktry/ui/components/code-block";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@cktry/ui/components/dialog";
import { IconButton } from "@cktry/ui/components/icon-button";
import { Placeholder } from "@cktry/ui/components/placeholder";
import { cn } from "@cktry/ui/lib/utils";
import { X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useStudio } from "@/stores/studio";
import type { DraftItem } from "@/tauri/api";
import { ClusterChip } from "./cluster-chip";
import { DraftMenu, DraftSummary } from "./draft-header";

const named = (domain: string) => domain.replaceAll("-", " ");

/**
 * The exam being built, beside the conversation (`bar`: under it, its
 * questions folded, on a narrow window): its questions (from the packs, or
 * new ones Claude wrote, each with where it stands) and the candidate's
 * step: prove the exam on a cluster, every question together (after reading
 * the new ones), and save it once they all prove
 */
export function DraftPanel({ bar = false }: { bar?: boolean }) {
	const { draft, session, verifying } = useStudio();
	const { removeItem, proveAndSave, save } = useStudio.getState();
	const navigate = useNavigate();
	const [reviewing, setReviewing] = useState(false);
	// On a narrow window the questions fold under the draft's bar
	const [unfolded, setUnfolded] = useState(false);
	const items = draft?.items ?? [];
	const unproven = items.filter(i => i.status.state !== "proven");
	// The new ones are read before their scripts run
	const unread = unproven.flatMap(i => (i.kind === "new" ? [i] : []));
	const proving = verifying !== null && verifying === session;
	const go = () => (unread.length > 0 ? setReviewing(true) : proveAndSave());

	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col",
				bar && "border-border border-t bg-foreground/[0.015]"
			)}
		>
			{/* Under the inspector's strip (its label and menu), as tall as the
			    conversation's header so their lines meet; in the bar, its menu here */}
			<div className="flex h-14 shrink-0 items-center gap-2 border-border border-b px-4">
				<DraftSummary className="min-w-0 flex-1" />
				{bar && !draft?.saved && <ClusterChip short />}
				{bar && items.length > 0 && (
					<Button
						size="push"
						variant="push"
						aria-expanded={unfolded}
						onClick={() => setUnfolded(u => !u)}
					>
						Questions {unfolded ? "▴" : "▾"}
					</Button>
				)}
				{bar && <DraftMenu />}
			</div>

			<div
				className={cn(
					"min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3",
					// In the bar: folded, or a part of the height when opened
					!bar ? "flex" : unfolded ? "flex max-h-[45vh]" : "hidden"
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

			{/* As tall as the composer at rest, so their lines meet (in the bar, as
			    tall as it needs); the steps: prove, then save */}
			<div
				className={cn(
					"flex shrink-0 flex-col justify-center gap-2 border-border border-t px-4 py-3",
					!bar && "min-h-[5.75rem]"
				)}
			>
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
						{items.length > 0 && (
							<span className="text-caption text-muted-foreground">
								{proving
									? "Running every question together, as in an exam…"
									: unproven.length > 0
										? "Saved once every question proves together"
										: "Every question proved together"}
							</span>
						)}
						<div className="flex items-center justify-end gap-2">
							<Button
								size="push"
								variant="pushDefault"
								disabled={items.length === 0 || !draft?.title || verifying !== null}
								title={
									verifying !== null && !proving
										? "Another conversation's exam is being proven"
										: undefined
								}
								onClick={unproven.length > 0 ? go : save}
							>
								{proving ? "Proving…" : unproven.length > 0 ? "Prove & save" : "Save exam"}
							</Button>
						</div>
					</>
				)}
			</div>

			{/* Reading them is the go to run their scripts on the cluster */}
			<Dialog open={reviewing} onOpenChange={setReviewing}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Prove the exam</DialogTitle>
						<DialogDescription>
							Every question runs on the verify cluster as in an exam: all the setups first, then
							each check must fail before its solution and pass after. Claude wrote these: read them
							first.
						</DialogDescription>
					</DialogHeader>
					<div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
						{unread.map(q => (
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
								proveAndSave();
							}}
						>
							Prove & save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

const key = (item: DraftItem) => (item.kind === "new" ? item.key : item.id);

/** A question of the draft: from the packs or new, and where it stands in the exam */
function Item({ item, onRemove }: { item: DraftItem; onRemove: () => void }) {
	const status =
		item.status.state === "proven" ? (
			<Badge variant="success">Proven</Badge>
		) : item.status.state === "failed" ? (
			<Badge variant="destructive">Did not prove</Badge>
		) : item.kind === "existing" ? (
			<Badge variant="subtle">From the packs</Badge>
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
			{item.status.state === "failed" && (
				<ul className="list-disc pl-4 text-2xs text-destructive">
					{item.status.problems.slice(0, 4).map(p => (
						<li key={p}>{p}</li>
					))}
				</ul>
			)}
		</div>
	);
}
