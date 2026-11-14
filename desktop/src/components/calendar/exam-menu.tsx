import { Button } from "@ckpro/ui/components/button";
import { Chip } from "@ckpro/ui/components/chip";
import { Input } from "@ckpro/ui/components/input";
import { MenuItem, menu } from "@ckpro/ui/components/menu";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@ckpro/ui/components/popover";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronDown, Plus } from "lucide-react";
import { useId, useState } from "react";
import { daysUntil } from "@/components/study/data";
import { addDays, dayKey, parseDay, readDay } from "@/days";
import { useExam } from "@/stores/exam";
import { useFocus, useSettings, useTargets } from "@/stores/settings";
import type { ExamTarget } from "@/tauri/api";
import { plural } from "@/words";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const short = (day: string) =>
	parseDay(day).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * The exams the candidate prepares for, as one dropdown beside the title,
 * however many there are: it says which the screen shows (all of them, or
 * one) and the next exam day; its menu picks one, changes one (Edit) or adds
 * one. Each certification once; CKS before a CKA is allowed, with a note (it
 * needs a passed CKA). With none yet, the button adds the first
 */
export function ExamMenu() {
	const targets = useTargets();
	const update = useSettings(s => s.update);
	const [focus, setFocus] = useFocus();
	const [open, setOpen] = useState(false);
	// The exam changed ("new": one added), its editor against the button
	const [editing, setEditing] = useState<ExamTarget | "new" | null>(null);
	const save = (next: ExamTarget[]) => update({ targets: next });
	const now = new Date();
	const left = (t: ExamTarget) => plural(daysUntil(t.date, now), "day");
	const next = targets.find(t => daysUntil(t.date, now) >= 0);
	const focused = targets.find(t => t.certification === focus);
	const edited = editing === "new" ? undefined : (editing ?? undefined);
	const show = (certification: string | null) => {
		setFocus(certification);
		setOpen(false);
	};
	const edit = (to: ExamTarget | "new") => {
		setOpen(false);
		setEditing(to);
	};
	return (
		<TargetEditor
			key={editing === "new" ? "new" : (editing?.certification ?? "none")}
			open={editing !== null}
			onOpenChange={o => !o && setEditing(null)}
			target={edited}
			taken={targets.map(t => t.certification).filter(c => c !== edited?.certification)}
			others={targets.filter(t => t !== edited)}
			onSave={t => save(edited ? targets.map(o => (o === edited ? t : o)) : [...targets, t])}
			onRemove={edited && (() => save(targets.filter(o => o !== edited)))}
		>
			<div className="flex min-w-0 items-center gap-2.5">
				{targets.length === 0 ? (
					<Button
						size="push"
						variant="push"
						aria-label="Add an exam you prepare for"
						onClick={() => edit("new")}
					>
						<Plus /> Your exam day
					</Button>
				) : (
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<Button size="push" variant="push" aria-label="Exams shown" className="gap-1.5 pr-2">
								{focused ? (
									<>
										<span aria-hidden className="size-2 rounded-[3px] bg-highlight" />
										{focused.certification.toUpperCase()}
									</>
								) : (
									"All exams"
								)}
								<ChevronDown className="size-3.5 text-muted-foreground" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className={cn(menu.surface, "w-72")}>
							<MenuItem checked={!focused} onClick={() => show(null)}>
								All exams
							</MenuItem>
							<div className={menu.separator} />
							{targets.map(t => (
								<div key={t.certification} className="group/exam relative">
									<MenuItem
										checked={t === focused}
										hint={`${short(t.date)} · ${left(t)}`}
										icon={
											<span className="size-2 rounded-[3px] bg-highlight group-hover/exam:bg-current" />
										}
										onClick={() => show(t.certification)}
										className="group-hover/exam:bg-highlight group-hover/exam:text-highlight-foreground group-hover/exam:[&>span:last-child]:invisible"
									>
										<span className="font-semibold">{t.certification.toUpperCase()}</span>
									</MenuItem>
									{/* Over the row's date while the pointer is on it */}
									<button
										type="button"
										aria-label={`${t.certification.toUpperCase()} exam on ${t.date}: change`}
										onClick={() => edit(t)}
										className="absolute top-0 right-2 h-6 rounded px-1 text-caption text-highlight-foreground underline opacity-0 focus-visible:opacity-100 group-hover/exam:opacity-100"
									>
										Edit…
									</button>
								</div>
							))}
							<div className={menu.separator} />
							<MenuItem aria-label="Add an exam you prepare for" onClick={() => edit("new")}>
								Add an exam…
							</MenuItem>
						</PopoverContent>
					</Popover>
				)}
				{(focused ?? next) && (
					<span className="truncate text-callout text-muted-foreground">
						{focused ? (
							`${short(focused.date)} · ${left(focused)}`
						) : next ? (
							<>
								Next:{" "}
								<span className="font-semibold text-foreground">
									{next.certification.toUpperCase()}
								</span>{" "}
								in {left(next)}
							</>
						) : null}
					</span>
				)}
			</div>
		</TargetEditor>
	);
}

function TargetEditor({
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
	children: React.ReactNode;
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
	const [typed, setTyped] = useState(target?.date ?? dayKey(addDays(new Date(), 60)));
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
