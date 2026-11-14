import { Button } from "@ckpro/ui/components/button";
import { Chip } from "@ckpro/ui/components/chip";
import { Input } from "@ckpro/ui/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@ckpro/ui/components/popover";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { type ReactNode, useId, useState } from "react";
import { addDays, dayKey, daysUntil, parseDay, readDay } from "@/days";
import { useExam } from "@/stores/exam";
import type { ExamTarget } from "@/tauri/api";
import { certName, plural } from "@/words";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** How far ahead a new exam's day starts, before the candidate types one */
const NEW_EXAM_DAYS = 60;

/**
 * An exam the candidate prepares for, changed or added, against what opened
 * it (`children`): the certification, the day as typed, the days kept free.
 * Each certification once; CKS before a CKA is allowed, with a note (it
 * needs a passed CKA)
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
	onSave: (target: ExamTarget) => void;
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
	const dayId = useId();
	const [certification, setCertification] = useState(
		target?.certification ?? certifications[0] ?? ""
	);
	// The day as typed, read as a day as it is typed
	const [typed, setTyped] = useState(target?.date ?? dayKey(addDays(new Date(), NEW_EXAM_DAYS)));
	const date = readDay(typed) ?? "";
	const [rest, setRest] = useState<number[]>(target?.rest_days ?? []);
	const valid = certification !== "" && date !== "" && date >= today;
	// CKS can only be taken with a passed CKA: said, not enforced
	const cka = others.find(o => o.certification === "cka");
	const cksEarly = certification === "cks" && (!cka || cka.date >= date);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>{children}</PopoverAnchor>
			<PopoverContent align="start" className="flex w-80 flex-col gap-3">
				<div className="font-semibold text-callout">
					{target ? "Your exam" : "An exam you prepare for"}
				</div>
				{target ? (
					<div className="text-callout">{certName(target.certification)}</div>
				) : certifications.length > 0 ? (
					<SegmentedControl
						label="Certification"
						value={certification || certifications[0]}
						onChange={setCertification}
						options={certifications.map(c => ({ value: c, label: certName(c) }))}
					/>
				) : (
					<div className="text-caption text-muted-foreground">
						Every certification is aimed at already
					</div>
				)}
				<div className="flex flex-col gap-1">
					<label htmlFor={dayId} className="text-caption text-muted-foreground">
						Exam day
					</label>
					<Input
						id={dayId}
						value={typed}
						placeholder="31 Jan 2027, 31/1, 2027-01-31"
						aria-invalid={typed.trim() !== "" && !valid}
						onChange={e => setTyped(e.target.value)}
					/>
					<span className="text-caption text-muted-foreground">
						{date === ""
							? "Type a day: 31 Jan 2027, 31/1, 2027-01-31"
							: date < today
								? "That day has passed"
								: `${parseDay(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${plural(daysUntil(date, new Date()), "day")} from now`}
					</span>
				</div>
				<div className="flex flex-col gap-1">
					<span className="text-caption text-muted-foreground">Days kept free</span>
					<div className="flex flex-wrap gap-1">
						{WEEKDAYS.map((d, i) => (
							<Chip
								key={d}
								size="xs"
								selected={rest.includes(i)}
								aria-pressed={rest.includes(i)}
								onClick={() =>
									setRest(r => (r.includes(i) ? r.filter(x => x !== i) : [...r, i].sort()))
								}
							>
								{d}
							</Chip>
						))}
					</div>
				</div>
				{cksEarly && (
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
					<Button
						size="push"
						variant="pushDefault"
						disabled={!valid}
						onClick={() => {
							onSave({
								certification: certification || certifications[0],
								date,
								started: target?.started ?? today,
								rest_days: rest,
							});
							setOpen(false);
						}}
					>
						{target ? "Save" : "Add"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
