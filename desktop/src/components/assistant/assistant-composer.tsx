import { Badge } from "@cktry/ui/components/badge";
import { Button } from "@cktry/ui/components/button";
import { Chip } from "@cktry/ui/components/chip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@cktry/ui/components/dropdown-menu";
import { IconButton } from "@cktry/ui/components/icon-button";
import { MenuCheck, menu, menuRow } from "@cktry/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@cktry/ui/components/popover";
import { Textarea } from "@cktry/ui/components/textarea";
import { Truncated } from "@cktry/ui/components/truncated";
import { cn } from "@cktry/ui/lib/utils";
import { AtSign, ChevronDown, Maximize2, Minimize2, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { blurb, effortLabel, shortName } from "@/components/assistant/models";
import { SendButton, sendOnEnter } from "@/components/assistant/send-button";
import { useCoach } from "@/stores/coach";
import type { CheckResult, Profile } from "@/tauri/api";

const tokens = (n: number) =>
	n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);

const PROFILES: { value: Profile; name: string; detail: string }[] = [
	{ value: "ask", name: "Ask", detail: "Reads the task and answers" },
	{ value: "agent", name: "Agent", detail: "Runs commands you allow" },
];

/**
 * Where the candidate writes to the assistant: what goes with the message
 * (the task, the last check, the cluster), the text, then one row of
 * controls. The profile: Ask reads and answers; Agent may also run commands
 * (practice). `onSend`: false when it could not be sent (nothing kept then)
 */
export function AssistantComposer({
	questionId,
	review,
	checks,
	ready,
	onSend,
}: {
	questionId: string;
	review: boolean;
	checks?: CheckResult[];
	/** The assistant can run on this Mac */
	ready: boolean;
	onSend: (text: string) => boolean;
}) {
	// Not the conversation: the composer stays still while an answer streams
	const coach = useCoach(
		useShallow(s => ({
			context: s.context,
			setContext: s.setContext,
			shared: s.shared,
			profile: s.profile,
			setProfile: s.setProfile,
			models: s.models,
			model: s.model,
			setModel: s.setModel,
			efforts: s.efforts,
			effort: s.effort,
			setEffort: s.setEffort,
			usage: s.usage,
			writing: s.writing,
			stop: s.stop,
		}))
	);
	const [draft, setDraft] = useState("");
	const [expanded, setExpanded] = useState(false);
	const writing = coach.writing === questionId;
	const usage = coach.usage[questionId];
	const model = coach.models.find(m => m.value === coach.model);
	const modelName = model?.name ?? coach.model;
	// Beside the model, muted, once one is picked (Auto says nothing)
	const effortName =
		coach.efforts.length > 0 && coach.effort !== "default" ? effortLabel(coach.effort) : null;

	return (
		// The editor: context, the text, then one row of controls. The
		// profile: Ask reads and answers; Agent may also run commands (practice)
		<div className="flex flex-col gap-2 border-border border-t bg-card/40 p-2.5">
			<div className="flex flex-wrap gap-1">
				<Chip size="xs">Task</Chip>
				{checks && coach.shared.checks && coach.context.checks && (
					<Chip size="xs" onRemove={() => coach.setContext({ checks: false })}>
						Last check
					</Chip>
				)}
				{coach.shared.cluster && coach.context.cluster && (
					<Chip size="xs" onRemove={() => coach.setContext({ cluster: false })}>
						Cluster
					</Chip>
				)}
			</div>
			<div className="relative">
				<Textarea
					variant="bare"
					value={draft}
					onChange={e => setDraft(e.target.value)}
					onKeyDown={sendOnEnter(() => onSend(draft) && setDraft(""))}
					rows={expanded ? 12 : 2}
					placeholder={review ? "Ask about your answer…" : "Ask about this task…"}
					aria-label="Ask the assistant"
					className={cn("select-text pr-7 text-callout", expanded ? "min-h-64" : "max-h-32")}
				/>
				<IconButton
					variant="toolbar"
					size="xs"
					className="absolute top-0 right-0"
					aria-label={expanded ? "Collapse" : "Expand Message Editor"}
					onClick={() => setExpanded(e => !e)}
				>
					{expanded ? <Minimize2 /> : <Maximize2 />}
				</IconButton>
			</div>
			<div className="flex items-center gap-1">
				<Popover>
					<PopoverTrigger asChild>
						<IconButton variant="toolbar" size="xs" aria-label="Add Context">
							<AtSign />
						</IconButton>
					</PopoverTrigger>
					<PopoverContent side="top" className={cn(menu.surface, "w-64")}>
						<div className={menu.header}>Add context</div>
						<ContextRow
							on={coach.context.checks && coach.shared.checks}
							disabled={!checks || !coach.shared.checks}
							label="Last check"
							hint={!coach.shared.checks ? "off in Settings" : checks ? undefined : "check first"}
							toggle={() => coach.setContext({ checks: !coach.context.checks })}
						/>
						<ContextRow
							on={coach.context.cluster && coach.shared.cluster}
							disabled={!coach.shared.cluster}
							label="Cluster snapshot"
							hint={coach.shared.cluster ? "read-only" : "off in Settings"}
							toggle={() => coach.setContext({ cluster: !coach.context.cluster })}
						/>
					</PopoverContent>
				</Popover>
				<span className="ml-auto" />
				{review ? (
					<span className="text-2xs text-muted-foreground">Ask</span>
				) : (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<PickerButton aria-label="Profile">
								{coach.profile === "agent" ? "Agent" : "Ask"}
							</PickerButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent side="top" align="end" className="w-56">
							<DropdownMenuRadioGroup
								value={coach.profile}
								onValueChange={v => coach.setProfile(v as Profile)}
							>
								{PROFILES.map(p => (
									<DropdownMenuRadioItem key={p.value} value={p.value} detail={p.detail}>
										{p.name}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				{/* The model, and its effort in a submenu: one picker, as Claude's own apps */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<PickerButton aria-label="Model and effort" className="min-w-0 shrink">
							{shortName(model, modelName)}
							{effortName && <span className="ml-1 opacity-60">{effortName}</span>}
						</PickerButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="top" align="end" className="w-72">
						{coach.models.length === 0 && (
							<div className={cn(menu.content, "py-1 text-muted-foreground text-xs")}>
								Loading models…
							</div>
						)}
						<DropdownMenuRadioGroup value={coach.model} onValueChange={coach.setModel}>
							{coach.models.map(m => (
								<DropdownMenuRadioItem key={m.value} value={m.value} detail={blurb(m)}>
									{shortName(m, m.name)}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
						{coach.efforts.length > 0 && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuSub>
									<DropdownMenuSubTrigger value={effortLabel(coach.effort)}>
										Effort
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent className="w-64">
										<DropdownMenuLabel className="font-normal text-caption">
											Higher effort means more thorough answers, but takes longer and uses your
											limits faster.
										</DropdownMenuLabel>
										<DropdownMenuRadioGroup value={coach.effort} onValueChange={coach.setEffort}>
											{coach.efforts.map(e => (
												<DropdownMenuRadioItem key={e.value} value={e.value}>
													{effortLabel(e.value, e.name)}
													{e.value === "default" && <Badge variant="tag">Recommended</Badge>}
													{e.value === "max" && (
														<Badge variant="warningTag">
															<TriangleAlert className="size-3" /> More usage
														</Badge>
													)}
												</DropdownMenuRadioItem>
											))}
										</DropdownMenuRadioGroup>
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				{usage && (
					<span className="px-1 text-2xs text-muted-foreground tabular-nums">
						{tokens(usage.used)} / {tokens(usage.size)}
					</span>
				)}
				<SendButton
					writing={writing}
					disabled={!draft.trim() || !!coach.writing || !ready}
					onSend={() => onSend(draft) && setDraft("")}
					onStop={coach.stop}
				/>
			</div>
		</div>
	);
}

/** The composer's pickers (model, effort): their value and a chevron */
/** A picker in the editor's row: its value, cut short when the pane is
 * narrow; hovering shows `full` (what the value means) */
function PickerButton({
	children,
	full,
	className,
	...props
}: React.ComponentProps<"button"> & { full?: ReactNode }) {
	return (
		<Button variant="quiet" size="picker" className={cn("shrink-0", className)} {...props}>
			<Truncated full={full} className="max-w-36">
				{children}
			</Truncated>
			<ChevronDown />
		</Button>
	);
}

function ContextRow({
	on,
	label,
	hint,
	disabled,
	toggle,
}: {
	on: boolean;
	label: string;
	hint?: ReactNode;
	disabled?: boolean;
	toggle: () => void;
}) {
	return (
		<button
			type="button"
			className={menuRow()}
			disabled={disabled}
			data-disabled={disabled || undefined}
			onClick={toggle}
		>
			{on && !disabled && <MenuCheck />}
			<span className={menu.label}>{label}</span>
			{hint && <span className={menu.hint}>{hint}</span>}
		</button>
	);
}
