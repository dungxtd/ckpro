import { IconButton } from "@ckpro/ui/components/icon-button";
import { RowCover } from "@ckpro/ui/components/row-cover";
import { Swatch } from "@ckpro/ui/components/swatch";
import { cn } from "@ckpro/ui/lib/utils";
import { Check, X } from "lucide-react";
import { parseDay } from "@/days";
import { useExam, useExamBusy } from "@/stores/exam";
import type { PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { certName, shortDay, startLabel } from "@/words";

/**
 * A planned exam as a line, wherever plans are listed (Home's Today, a day
 * of the Calendar's week): its mark, its title, and under it the exam (with
 * several shown), the way it is taken and how it went. `startable`: pressed,
 * it starts once confirmed (`StartPrompt`). `compact` fits a week's column:
 * a swatch for the mark, two lines of title, and, with `onRemove`, a remove
 * button under the pointer. Its controls name the day, so a week's lines
 * tell apart
 */
export function PlanRow({
	plan: p,
	startable,
	several,
	compact = false,
	next = false,
	late = false,
	onRemove,
}: {
	plan: PlanView;
	startable: boolean;
	/** Several exams shown: it says which */
	several: boolean;
	compact?: boolean;
	/** What Start next starts (Today) */
	next?: boolean;
	/** Its day has passed and it was not taken */
	late?: boolean;
	onRemove?: (plan: PlanView) => void;
}) {
	const askStart = useExam(s => s.askStart);
	const busy = useExamBusy();
	const day = shortDay(parseDay(p.day));
	const done = p.done !== null;
	const cert = several && p.certification ? `${certName(p.certification)} · ` : "";
	const cover = startable && (
		<RowCover
			aria-label={`${startLabel(p.mode)}: ${shortTitle(p.title)}, ${day}`}
			disabled={busy}
			onClick={() => askStart(p.exam_id, p.mode, p.title)}
		/>
	);

	if (compact)
		return (
			<div className="group/plan relative flex gap-1.5 rounded-md px-1 py-1 hover:bg-hover">
				{cover}
				<Swatch variant="ring" tone="muted" className="mt-1" />
				<span className="min-w-0 flex-1 text-caption leading-snug">
					<span className="line-clamp-2 hyphens-auto break-words">{shortTitle(p.title)}</span>
					<span className="block truncate text-2xs text-muted-foreground">
						{cert}
						{p.mode}
						{late && " · not taken"}
					</span>
				</span>
				{onRemove && (
					<IconButton
						variant="toolbar"
						size="sm"
						aria-label={`Remove ${p.title}, ${day}`}
						onClick={() => onRemove(p)}
						className="absolute top-0.5 right-0.5 size-5 opacity-0 focus-visible:opacity-100 group-hover/plan:opacity-100 [&_svg]:size-3"
					>
						<X />
					</IconButton>
				)}
			</div>
		);

	return (
		<div
			className={cn(
				"relative flex items-center gap-3 rounded-lg px-2 py-2",
				startable && "hover:bg-hover"
			)}
		>
			{cover}
			<span
				className={cn(
					"grid size-4.5 shrink-0 place-items-center rounded-full",
					done ? "bg-success text-success-foreground" : "ring-2 ring-muted-foreground ring-inset"
				)}
			>
				{done && <Check className="size-3" strokeWidth={3} />}
			</span>
			<div className="min-w-0 flex-1">
				<div className={cn("truncate text-callout", done && "text-muted-foreground line-through")}>
					{p.title}
				</div>
				<div className="text-2xs text-muted-foreground">
					{cert}
					{p.mode === "exam" ? "Exam" : "Practice"}
					{p.done !== null && <span className="tabular-nums">, {Math.round(p.done)}%</span>}
					{next && <span className="text-highlight"> · Next</span>}
				</div>
			</div>
		</div>
	);
}
