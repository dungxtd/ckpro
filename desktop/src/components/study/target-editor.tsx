import { Button } from "@ckpro/ui/components/button";
import { Popover, PopoverAnchor, PopoverContent } from "@ckpro/ui/components/popover";
import type { ReactNode } from "react";
import { ExamAsker } from "@/components/study/exam-asker";
import { dayKey } from "@/days";
import { useExam } from "@/stores/exam";
import type { ExamTarget } from "@/tauri/api";
import { certName, examDayText } from "@/words";

/**
 * An exam the candidate prepares for, added or changed, against what opened
 * it (`children`): asked one question at a time, as the first launch's
 * setup asks (`ExamAsker`), nothing filled in; changed, its day now is
 * shown above and Remove takes it away. Each certification once; CKS
 * before a CKA is allowed, with a note. `onSave` says whether the day is
 * booked (a goal is not)
 */
export function TargetEditor({
	open,
	onOpenChange,
	target,
	taken,
	others,
	onSave,
	onRemove,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The exam changed; none: one added */
	target?: ExamTarget;
	/** Certifications already aimed at (each once) */
	taken: string[];
	others: ExamTarget[];
	onSave: (target: ExamTarget, booked: boolean) => void;
	onRemove?: () => void;
	/** What it opens against */
	children: ReactNode;
}) {
	const catalog = useExam(s => s.catalog);
	const certifications = [...new Set(catalog.map(e => e.certification))].filter(
		c => !taken.includes(c)
	);
	const today = dayKey(new Date());
	const setOpen = onOpenChange;
	// Added or changed alike: asked again, as the first launch asks; a
	// change keeps when the preparation started and the days kept free
	const certs = target ? [target.certification] : certifications;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>{children}</PopoverAnchor>
			<PopoverContent align="start" className="flex w-96 flex-col gap-3">
				<div className="flex flex-col gap-0.5">
					<span className="font-semibold text-callout">
						{target ? `Your ${certName(target.certification)} exam` : "An exam you prepare for"}
					</span>
					{target && (
						<span className="text-caption text-muted-foreground">
							Now: {examDayText(target.date)}
						</span>
					)}
				</div>
				{certs.length > 0 ? (
					<ExamAsker
						compact
						certs={certs}
						first="Which exam?"
						onTell={({ certification, date, booked }) => {
							onSave(
								{
									certification,
									date,
									started: target?.started ?? today,
									rest_days: target?.rest_days ?? [],
								},
								booked
							);
							setOpen(false);
						}}
					/>
				) : (
					<div className="text-caption text-muted-foreground">
						Every certification is aimed at already
					</div>
				)}
				{cksEarly(certs, others) && (
					<div className="text-caption text-warning">
						CKS needs a passed CKA: take the CKA first
					</div>
				)}
				<div className="flex items-center gap-2">
					{onRemove && (
						<Button
							size="push"
							variant="push"
							className="text-destructive"
							onClick={() => {
								onRemove();
								setOpen(false);
							}}
						>
							Remove
						</Button>
					)}
					<span className="flex-1" />
					<Button size="push" variant="push" onClick={() => setOpen(false)}>
						Cancel
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

/** CKS can only be taken with a passed CKA: said, not enforced */
const cksEarly = (certs: string[], others: ExamTarget[]) =>
	certs.length === 1 && certs[0] === "cks" && !others.some(o => o.certification === "cka");
