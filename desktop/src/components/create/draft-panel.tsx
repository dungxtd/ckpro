import { Alert } from "@ckpro/ui/components/alert";
import { Badge } from "@ckpro/ui/components/badge";
import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { IconButton } from "@ckpro/ui/components/icon-button";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { Progress } from "@ckpro/ui/components/progress";
import { FOLD_SLACK, ResizeHandle } from "@ckpro/ui/components/resize-handle";
import { useNow } from "@ckpro/ui/hooks/use-now";
import { clock } from "@ckpro/ui/lib/time";
import { cn } from "@ckpro/ui/lib/utils";
import { X } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { AssistantIcon } from "@/components/assistant/assistant-icon";
import { useStudio } from "@/stores/studio";
import type { DraftItem, Proof } from "@/tauri/api";
import { domainName, gb, plural } from "@/words";
import { DraftMenu, DraftSummary, LengthFit, ProofTabs } from "./draft-header";
import { NewScripts, ProofPreview, ProofSteps } from "./proof-steps";

const key = (item: DraftItem) => (item.kind === "new" ? item.key : item.id);

/**
 * The exam being built, beside the conversation (`bar`: under it on a
 * narrow window, as tall as the candidate drags it): its questions (from the packs, or
 * new ones Claude wrote, each with where it stands) and the candidate's
 * step: prove it on a cluster made for it, every question together (their
 * scripts held to the script rules, nothing to read first), and save it
 * once they all prove
 */
export function DraftPanel({ bar = false }: { bar?: boolean }) {
	const draft = useStudio(s => s.draft);
	const tab = useStudio(s => s.tab);
	const plan = useStudio(s => s.plan);
	// The proof shown in its tab: the one running, or the latest
	const shownProof = useStudio(s => (s.session === null ? undefined : s.last[s.session]));
	const proof = shownProof && !shownProof.ended_at ? shownProof : undefined;
	const { removeItem } = useStudio.getState();
	const items = draft?.items ?? [];
	// On a narrow window: a panel under the chat, as tall as the candidate
	// drags it (its head and foot at the least, the chat kept readable)
	const sheet = useSheet(bar, items.length > 0);
	// Some proved, and some came or changed since: those keep what they proved
	const partly =
		items.some(i => i.status.state === "proven") && items.some(i => i.status.state === "linted");

	return (
		<div
			ref={sheet.panel}
			style={bar ? { height: sheet.height } : undefined}
			className={cn(
				"flex min-h-0 flex-col",
				bar
					? "relative flex-none overflow-hidden border-border border-t bg-foreground/[0.015]"
					: "flex-1"
			)}
		>
			{bar && (
				<ResizeHandle
					label="Resize the exam"
					value={sheet.height}
					min={sheet.min}
					max={sheet.max}
					onChange={sheet.setHeight}
					className="absolute inset-x-0 top-0 z-10"
				/>
			)}
			{/* Under the inspector's strip (its tabs and menu), as tall as the
			    conversation's header so their lines meet; in the bar, its menu here */}
			<div className="flex h-14 shrink-0 items-center gap-2 border-border border-b px-4">
				<DraftSummary
					className="min-w-0 flex-1"
					trailing={
						bar && (
							<>
								<ProofTabs />
								<DraftMenu />
							</>
						)
					}
				/>
			</div>

			<div
				className={cn(
					"min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3",
					// In the bar: there once it is dragged open
					!bar || sheet.open ? "flex" : "hidden"
				)}
			>
				{tab === "proof" && items.length > 0 ? (
					<>
						{shownProof ? (
							<ProofSteps key={shownProof.activity} proof={shownProof} />
						) : (
							<ProofPreview />
						)}
						<NewScripts />
					</>
				) : items.length === 0 ? (
					<Placeholder
						className="my-auto"
						sample={[1, 2, 3].map(n => <Card key={n} padding="none" className="mb-2 h-14" />)}
						title="The exam shows here"
						description="Ask the assistant for one: it picks questions and writes new ones"
					/>
				) : (
					<>
						<LengthFit />
						{items.map(item => (
							<Item
								key={key(item)}
								item={item}
								proof={proof}
								partly={partly}
								deleted={!!plan?.missing.includes(key(item))}
								onRemove={() => removeItem(key(item))}
							/>
						))}
					</>
				)}
			</div>

			{/* As tall as the composer at rest, so their lines meet (in the bar, as
			    tall as it needs) */}
			<div
				ref={sheet.foot}
				className={cn(
					"flex shrink-0 justify-center gap-2 border-border border-t px-4",
					// Beside the composer, as tall as it; in the bar one line, the
					// step at its end, so the panel folds small
					bar
						? "flex-row flex-wrap items-center justify-between py-2 [&>*:last-child]:ml-auto"
						: "min-h-[5.75rem] flex-col py-3"
				)}
			>
				{proof ? <ProofProgress proof={proof} /> : <ProofFoot />}
			</div>
		</div>
	);
}

/**
 * The panel's foot between proofs: what proving takes (time, cluster,
 * memory) or why it cannot run now, how the last one ended, and the step
 * from here: prove, prove what changed, have Claude fix what did not
 * prove, or open the exam saved
 */
function ProofFoot() {
	const draft = useStudio(s => s.draft);
	const plan = useStudio(s => s.plan);
	// How the last proof ended, if it did
	const last = useStudio(s => (s.session === null ? undefined : s.last[s.session]));
	const { askToFix, save, proveAndSave: onProve } = useStudio.getState();
	const navigate = useNavigate();
	const items = draft?.items ?? [];
	const took = last?.ended_at ? clock(last.ended_at - (last.started_at ?? last.ended_at)) : null;
	const failed = items.filter(i => i.status.state === "failed").length;
	const proven = items.filter(i => i.status.state === "proven").length;
	const changed = items.length - proven;
	const line = (children: ReactNode, className?: string) => (
		<span className={cn("text-caption text-muted-foreground", className)}>{children}</span>
	);

	if (draft?.saved)
		return (
			<>
				{took && line(`Every question proved together · ${took}`, "text-success")}
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
				<Alert variant="warning" size="sm" className="py-2">
					{plan.problem}
				</Alert>
			) : failed > 0 ? (
				line(
					<>
						<span className="text-destructive tabular-nums">
							{failed} of {last?.ended_at ? last.checking.length : items.length} did not prove
						</span>
						{took && ` · ${took}`} · cluster removed
					</>
				)
			) : last?.stopped && proven === 0 ? (
				line(
					`Stopped at question ${last.results.length + 1} of ${last.checking.length}; its cluster is removed`
				)
			) : proven > 0 && changed > 0 ? (
				line(
					`${changed} changed: ~${plan?.minutes_changed ?? "?"} min, every setup again, ${changed === 1 ? "its checks" : "their checks"} only`
				)
			) : changed > 0 ? (
				line(
					`Saved once every question proves together: ~${plan?.minutes_all ?? "?"} min on ${cluster}, made for it and removed after`
				)
			) : draft?.together ? (
				line("Every question proved together")
			) : (
				line("Every question proved, not all in one run since the last change")
			)}
			<div className="flex items-center justify-end gap-2">
				{changed === 0 ? (
					<>
						{!draft?.together && (
							<Button
								size="push"
								variant="push"
								disabled={blocked}
								onClick={() => onProve("all", false)}
							>
								Prove all together
							</Button>
						)}
						<Button
							size="push"
							variant="pushDefault"
							disabled={!draft?.title}
							onClick={() => save()}
						>
							Save exam
						</Button>
					</>
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
						<Button size="push" variant="assistant" onClick={askToFix}>
							<AssistantIcon className="size-3.5" /> Ask the assistant to fix
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
							{proven > 0 ? `Prove ${changed} and save` : "Prove and save"}
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
 * waiting its turn. The one changing the nodes says it runs last; one
 * whose question was deleted says so, to be taken out
 */
function Item({
	item,
	proof,
	partly,
	deleted,
	onRemove,
}: {
	item: DraftItem;
	proof?: Proof;
	partly: boolean;
	/** Its question was deleted since it was added */
	deleted: boolean;
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
	// A new question Claude has not named yet still reads as one
	const name = item.title || (item.kind === "existing" ? item.id : "Untitled question");
	// The first problems, and how many more (the Proof tab has them all)
	const problems = shown?.state === "failed" ? shown.problems : [];
	const status = deleted ? (
		<Badge variant="destructive">Deleted</Badge>
	) : running ? (
		<Badge variant="accent" className="tabular-nums">
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
		<Card
			padding="none"
			className={cn(
				"group flex flex-col gap-1 px-3 py-2 transition-opacity",
				running && "border-highlight/70",
				waiting && "opacity-55"
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<span
					className={cn("min-w-0 font-medium text-callout", !item.title && "text-muted-foreground")}
				>
					{name}
				</span>
				<div className="flex shrink-0 items-center gap-1">
					{status}
					{!proof && (
						<IconButton
							variant="toolbar"
							size="xs"
							aria-label={`Remove ${name}`}
							className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
							onClick={onRemove}
						>
							<X />
						</IconButton>
					)}
				</div>
			</div>
			<span className="text-2xs text-muted-foreground capitalize">{domainName(item.domain)}</span>
			{problems.length > 0 && (
				<ul className="list-disc pl-4 text-2xs text-destructive">
					{problems.slice(0, 4).map(p => (
						<li key={p}>{p}</li>
					))}
					{problems.length > 4 && (
						<li className="list-none text-muted-foreground tabular-nums">
							and {problems.length - 4} more
						</li>
					)}
				</ul>
			)}
		</Card>
	);
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
	const at = proof.stopped
		? "Stopping: its cluster is being removed"
		: stage.stage === "cluster"
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
				{!proof.stopped && (
					<Button size="push" variant="push" onClick={stopProof}>
						Stop
					</Button>
				)}
				<Button size="push" variant="pushDefault" disabled>
					{proof.stopped ? "Stopping…" : "Proving…"}
				</Button>
			</div>
		</>
	);
}

/** The head's height (`h-14`), and the room the chat keeps above the panel:
 * its header, the composer and a few lines of the conversation */
const HEAD = 56;
const CHAT_KEEPS = 260;

/**
 * The narrow window's panel height: its head and foot at the least, the
 * window less the chat's room at the most; to start, half of it once the
 * draft has questions, folded before (the chat is where it starts)
 */
function useSheet(on: boolean, filled: boolean) {
	const panel = useRef<HTMLDivElement>(null);
	const foot = useRef<HTMLDivElement>(null);
	const [room, setRoom] = useState({ total: 0, foot: 0 });
	const [chosen, setHeight] = useState<number | null>(null);
	useLayoutEffect(() => {
		if (!on) return;
		const outer = panel.current?.parentElement;
		const f = foot.current;
		if (!outer || !f) return;
		const measure = () => setRoom({ total: outer.clientHeight, foot: f.offsetHeight });
		measure();
		const watch = new ResizeObserver(measure);
		watch.observe(outer);
		watch.observe(f);
		return () => watch.disconnect();
	}, [on]);
	const min = HEAD + room.foot;
	const max = Math.max(min, room.total - CHAT_KEEPS);
	const height = Math.min(
		max,
		Math.max(min, chosen ?? (filled ? Math.round(room.total / 2) : min))
	);
	return { panel, foot, height, min, max, setHeight, open: height > min + FOLD_SLACK };
}
