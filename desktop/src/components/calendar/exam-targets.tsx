import { Button } from "@ckpro/ui/components/button";
import { Chip } from "@ckpro/ui/components/chip";
import { Input } from "@ckpro/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { Flag, Plus } from "lucide-react";
import { useId, useState } from "react";
import { daysUntil } from "@/components/study/data";
import { addDays, dayKey, parseDay, readDay } from "@/days";
import { useExam } from "@/stores/exam";
import { useSettings, useTargets } from "@/stores/settings";
import type { ExamTarget } from "@/tauri/api";
import { plural } from "@/words";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const short = (day: string) =>
	parseDay(day).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * The exams the candidate prepares for: one chip each (its day, the days
 * left), opening it to change or remove; Exam adds one. Each certification
 * once; CKS before a CKA is allowed, with a note (it needs a passed CKA)
 */
export function ExamTargets() {
	const targets = useTargets();
	const update = useSettings(s => s.update);
	const save = (next: ExamTarget[]) => update({ targets: next });
	const now = new Date();
	return (
		<div className="flex flex-wrap items-center gap-2">
			{targets.map(t => (
				<TargetEditor
					key={t.certification}
					target={t}
					taken={targets.map(o => o.certification).filter(c => c !== t.certification)}
					others={targets.filter(o => o !== t)}
					onSave={edited => save(targets.map(o => (o === t ? edited : o)))}
					onRemove={() => save(targets.filter(o => o !== t))}
				>
					<Chip
						variant="planned"
						aria-label={`${t.certification.toUpperCase()} exam on ${t.date}: change`}
					>
						<Flag className="size-3.5" />
						<span className="font-semibold">{t.certification.toUpperCase()}</span>
						<span>
							{short(t.date)}
							{daysUntil(t.date, now) >= 0 && ` · ${plural(daysUntil(t.date, now), "day")}`}
						</span>
					</Chip>
				</TargetEditor>
			))}
			<TargetEditor
				taken={targets.map(t => t.certification)}
				others={targets}
				onSave={added => save([...targets, added])}
			>
				<Chip aria-label="Add an exam you prepare for">
					<Plus className="size-3.5" /> Exam
				</Chip>
			</TargetEditor>
		</div>
	);
}

function TargetEditor({
	target,
	taken,
	others,
	onSave,
	onRemove,
	children,
}: {
	/** The exam changed; none: one added */
	target?: ExamTarget;
	/** Certifications already aimed at (each once) */
	taken: string[];
	others: ExamTarget[];
	onSave: (target: ExamTarget) => void;
	onRemove?: () => void;
	children: React.ReactNode;
}) {
	const catalog = useExam(s => s.catalog);
	const certifications = [...new Set(catalog.map(e => e.certification))].filter(
		c => !taken.includes(c)
	);
	const today = dayKey(new Date());
	const [open, setOpen] = useState(false);
	const dayId = useId();
	const [certification, setCertification] = useState(target?.certification ?? "");
	// The day as typed, read as a day as it is typed
	const [typed, setTyped] = useState(target?.date ?? dayKey(addDays(new Date(), 60)));
	const date = readDay(typed) ?? "";
	const [rest, setRest] = useState<number[]>(target?.rest_days ?? []);
	const reset = () => {
		setCertification(target?.certification ?? certifications[0] ?? "");
		setTyped(target?.date ?? dayKey(addDays(new Date(), 60)));
		setRest(target?.rest_days ?? []);
	};
	const valid = certification !== "" && date !== "" && date >= today;
	// CKS can only be taken with a passed CKA: said, not enforced
	const cka = others.find(o => o.certification === "cka");
	const cksEarly = certification === "cks" && (!cka || cka.date >= date);

	return (
		<Popover
			open={open}
			onOpenChange={next => {
				if (next) reset();
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent align="start" className="flex w-80 flex-col gap-3">
				<div className="font-semibold text-callout">
					{target ? "Your exam" : "An exam you prepare for"}
				</div>
				{target ? (
					<div className="text-callout">{target.certification.toUpperCase()}</div>
				) : certifications.length > 0 ? (
					<SegmentedControl
						label="Certification"
						value={certification || certifications[0]}
						onChange={setCertification}
						options={certifications.map(c => ({ value: c, label: c.toUpperCase() }))}
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
