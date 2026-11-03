import { Alert } from "@cktry/ui/components/alert";
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
import { Progress } from "@cktry/ui/components/progress";
import { cn } from "@cktry/ui/lib/utils";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { clock } from "@/components/activity/activity-progress";
import { ClaudeIcon } from "@/components/assistant/claude-icon";
import { useStudio } from "@/stores/studio";
import type { DraftItem, Proof, ProofScope } from "@/tauri/api";
import { DraftMenu, DraftSummary, ProofTabs } from "./draft-header";
import { ProofSteps } from "./proof-steps";

const named = (domain: string) => domain.replaceAll("-", " ");
const key = (item: DraftItem) => (item.kind === "new" ? item.key : item.id);
const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The exam being built, beside the conversation (`bar`: under it, its
 * questions folded, on a narrow window): its questions (from the packs, or
 * new ones Claude wrote, each with where it stands) and the candidate's
 * step: prove it on a cluster made for it, every question together (after
 * reading the new ones), and save it once they all prove
 */
export function DraftPanel({ bar = false }: { bar?: boolean }) {
	const { draft, session, proofs, last, tab } = useStudio();
	const { removeItem, proveAndSave } = useStudio.getState();
	const proof = session === null ? undefined : proofs[session];
	// The proof shown in its tab: the one running, or the latest
	const shownProof = session === null ? undefined : last[session];
	const [reviewing, setReviewing] = useState<ProofScope | null>(null);
	// On a narrow window the questions fold under the draft's bar
	const [unfolded, setUnfolded] = useState(false);
	const items = draft?.items ?? [];
	// Some proved, and some came or changed since: those keep what they proved
	const partly =
		items.some(i => i.status.state === "proven") && items.some(i => i.status.state === "linted");
	// The new ones Claude wrote are read before their scripts run
	const unread = (scope: ProofScope) =>
		items.flatMap(i =>
			i.kind === "new" && (scope === "all" || i.status.state !== "proven") ? [i] : []
		);
	const prove = (scope: ProofScope) => {
		if (unread(scope).length > 0) setReviewing(scope);
		else proveAndSave(scope);
	};

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
				{bar && <ProofTabs />}
				{bar && <DraftMenu />}
			</div>

			<div
				className={cn(
					"min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3",
					// In the bar: folded, or a part of the height when opened
					!bar ? "flex" : unfolded ? "flex max-h-[45vh]" : "hidden"
				)}
			>
				{tab === "proof" && shownProof ? (
					<ProofSteps proof={shownProof} />
				) : items.length === 0 ? (
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
						<Item
							key={key(item)}
							item={item}
							proof={proof}
							partly={partly}
							onRemove={() => removeItem(key(item))}
						/>
					))
				)}
			</div>

			{/* As tall as the composer at rest, so their lines meet (in the bar, as
			    tall as it needs) */}
			<div
				className={cn(
					"flex shrink-0 flex-col justify-center gap-2 border-border border-t px-4 py-3",
					!bar && "min-h-[5.75rem]"
				)}
			>
				{proof ? <ProofProgress proof={proof} /> : <ProofFoot onProve={prove} />}
			</div>

			{/* Reading them is the go to run their scripts on the cluster */}
			<Dialog open={reviewing !== null} onOpenChange={open => !open && setReviewing(null)}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Prove the exam</DialogTitle>
						<DialogDescription>
							Every question runs on a cluster made for it, as in an exam: all the setups first,
							then each check must fail before its solution and pass after. Claude wrote these: read
							them first.
						</DialogDescription>
					</DialogHeader>
					<div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
						{(reviewing ? unread(reviewing) : []).map(q => (
							<div key={q.key} className="flex flex-col gap-1.5">
								<span className="font-semibold text-callout">{q.title}</span>
								<CodeBlock title="yaml" wrap>
									{q.yaml}
								</CodeBlock>
							</div>
						))}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setReviewing(null)}>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (reviewing) proveAndSave(reviewing);
								setReviewing(null);
							}}
						>
							Prove &amp; save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

/**
 * The panel's foot between proofs: what proving takes (time, cluster,
 * memory) or why it cannot run now, how the last one ended, and the step
 * from here: prove, prove what changed, have Claude fix what did not
 * prove, or open the exam saved
 */
function ProofFoot({ onProve }: { onProve: (scope: ProofScope) => void }) {
	const { draft, session, plan, ended } = useStudio();
	const { askToFix, save } = useStudio.getState();
	const navigate = useNavigate();
	const items = draft?.items ?? [];
	const end = session === null ? undefined : ended[session];
	const failed = items.filter(i => i.status.state === "failed").length;
	const proven = items.filter(i => i.status.state === "proven").length;
	const changed = items.length - proven;
	const line = (children: ReactNode, className?: string) => (
		<span className={cn("text-caption text-muted-foreground", className)}>{children}</span>
	);

	if (draft?.saved)
		return (
			<>
				{end?.kind === "done" &&
					line(`Every question proved together · ${clock(end.ms)}`, "text-success")}
				<div className="flex justify-end">
					<Button
						size="push"
						variant="pushDefault"
						onClick={() => navigate(`/exams?exam=${encodeURIComponent(draft.saved ?? "")}`)}
					>
						Open the exam
					</Button>
				</div>
			</>
		);
	if (items.length === 0) return null;

	const blocked = !!plan?.problem;
	const cluster = plan
		? `a cluster with ${plural(plan.workers, "worker")} (${gb(plan.mb)})`
		: "a cluster";
	return (
		<>
			{plan?.problem ? (
				<Alert variant="warning" className="py-2 text-caption">
					{plan.problem}
				</Alert>
			) : failed > 0 ? (
				line(
					<>
						<span className="text-destructive">
							{failed} of {end?.kind === "done" ? end.checked : items.length} did not prove
						</span>
						{end?.kind === "done" && ` · ${clock(end.ms)}`} · cluster removed
					</>
				)
			) : end?.kind === "stopped" && proven === 0 ? (
				line(`Stopped at question ${end.at} of ${end.of}; its cluster is removed`)
			) : proven > 0 && changed > 0 ? (
				line(
					`${changed} changed: ~${plan?.minutes_changed ?? "?"} min, every setup again, ${changed === 1 ? "its checks" : "their checks"} only`
				)
			) : changed > 0 ? (
				line(
					`Saved once every question proves together: ~${plan?.minutes_all ?? "?"} min on ${cluster}`
				)
			) : (
				line("Every question proved together")
			)}
			<div className="flex items-center justify-end gap-2">
				{changed === 0 ? (
					<Button size="push" variant="pushDefault" disabled={!draft?.title} onClick={() => save()}>
						Save exam
					</Button>
				) : failed > 0 ? (
					<>
						<Button
							size="push"
							variant="push"
							disabled={blocked}
							onClick={() => onProve("changed")}
						>
							Prove again
						</Button>
						<Button
							size="push"
							variant="push"
							className="bg-claude/15 text-claude shadow-none hover:bg-claude/25"
							onClick={askToFix}
						>
							<ClaudeIcon className="size-3.5" /> Ask Claude to fix
						</Button>
					</>
				) : (
					<>
						{proven > 0 && (
							<Button size="push" variant="push" disabled={blocked} onClick={() => onProve("all")}>
								Prove all again
							</Button>
						)}
						<Button
							size="push"
							variant="pushDefault"
							disabled={blocked || !draft?.title}
							onClick={() => onProve("changed")}
						>
							{proven > 0 ? `Prove ${changed} & save` : "Prove & save"}
						</Button>
					</>
				)}
			</div>
		</>
	);
}

/**
 * A question of the draft: from the packs or new, and where it stands in the
 * exam (`partly`: some proved, so a proven one is from the last proof);
 * while it is proven, its result as soon as it has one, the one running, or
 * waiting its turn. The one changing the nodes says it runs last
 */
function Item({
	item,
	proof,
	partly,
	onRemove,
}: {
	item: DraftItem;
	proof?: Proof;
	partly: boolean;
	onRemove: () => void;
}) {
	const id = key(item);
	const checked = !!proof?.checking.includes(id);
	const result = proof?.results.find(r => r.key === id)?.status;
	// Not checked by this proof: it keeps what it proved
	const shown = proof && checked ? (result ?? null) : item.status;
	const running = proof?.stage.stage === "proving" && proof.stage.key === id ? proof.stage : null;
	const waiting = checked && !running && !result;
	const now = useNow(!!running);
	const status = running ? (
		<Badge className="bg-highlight/15 text-highlight tabular-nums">
			Running · {clock(now - (running.since ?? now))}
		</Badge>
	) : !shown ? null : shown.state === "proven" ? (
		<Badge variant="success">{partly && !proof ? "Proven · last run" : "Proven"}</Badge>
	) : shown.state === "failed" ? (
		<Badge variant="destructive">Did not prove</Badge>
	) : item.disrupts ? (
		<Badge variant="warningTag">Changes the nodes · runs last</Badge>
	) : item.kind === "existing" ? (
		<Badge variant="subtle">From the packs</Badge>
	) : (
		<Badge variant="warningTag">New · lints</Badge>
	);
	return (
		<div
			className={cn(
				"group flex flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2 transition-opacity",
				running && "border-highlight/70",
				waiting && "opacity-55"
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<span className="min-w-0 font-medium text-callout">
					{item.title || (item.kind === "existing" ? item.id : "")}
				</span>
				<div className="flex shrink-0 items-center gap-1">
					{status}
					{!proof && (
						<IconButton
							variant="toolbar"
							size="xs"
							aria-label={`Remove ${item.title}`}
							className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
							onClick={onRemove}
						>
							<X />
						</IconButton>
					)}
				</div>
			</div>
			<span className="text-2xs text-muted-foreground capitalize">{named(item.domain)}</span>
			{shown?.state === "failed" && (
				<ul className="list-disc pl-4 text-2xs text-destructive">
					{shown.problems.slice(0, 4).map(p => (
						<li key={p}>{p}</li>
					))}
				</ul>
			)}
		</div>
	);
}

/** Ticks every second while `on` */
function useNow(on: boolean) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (!on) return;
		setNow(Date.now());
		const tick = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(tick);
	}, [on]);
	return now;
}

/**
 * The exam being proven, at the panel's foot: what it is at (its cluster
 * being made, the setups, question n of those checked), how far and how
 * long, and a way to stop it (its cluster goes). Its steps and their logs
 * are the Proof tab's
 */
function ProofProgress({ proof }: { proof: Proof }) {
	const total = useStudio(s => s.draft?.items.length ?? 0);
	const { stopProof } = useStudio.getState();
	const now = useNow(true);
	const checking = proof.checking.length;
	const stage = proof.stage;
	const at =
		stage.stage === "cluster"
			? `Making a cluster with ${plural(stage.workers, "worker")}`
			: stage.stage === "setting_up"
				? `Setting up ${plural(total || checking, "question")}`
				: `Question ${proof.results.length + 1} of ${checking}`;
	return (
		<>
			<div className="flex items-center gap-2 text-caption">
				<span className="min-w-0 flex-1 truncate">{at}</span>
				<span className="text-muted-foreground tabular-nums">
					{clock(now - (proof.started_at ?? now))}
				</span>
			</div>
			<Progress
				label="Questions proven"
				value={(proof.results.length * 100) / Math.max(1, checking)}
			/>
			<div className="flex items-center justify-end gap-2">
				<Button size="push" variant="push" onClick={stopProof}>
					Stop
				</Button>
				<Button size="push" variant="pushDefault" disabled>
					Proving…
				</Button>
			</div>
		</>
	);
}
