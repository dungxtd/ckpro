import { Button } from "@ckpro/ui/components/button";
import { MenuItem, menu } from "@ckpro/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { Swatch } from "@ckpro/ui/components/swatch";
import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { TargetEditor } from "@/components/study/target-editor";
import { daysUntil, parseDay } from "@/days";
import { useFocus, useSettings, useTargets } from "@/stores/settings";
import type { ExamTarget } from "@/tauri/api";
import { certName, plural } from "@/words";

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
										<Swatch size="sm" tone="highlight" />
										{certName(focused.certification)}
									</>
								) : (
									"All exams"
								)}
								<ChevronDown className="size-3.5 text-muted-foreground" />
							</Button>
						</PopoverTrigger>
						<PopoverContent variant="menu" className="w-72">
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
											<Swatch size="sm" tone="highlight" className="group-hover/exam:bg-current" />
										}
										onClick={() => show(t.certification)}
										className="group-hover/exam:bg-highlight group-hover/exam:text-highlight-foreground group-hover/exam:[&>span:last-child]:invisible"
									>
										<span className="font-semibold">{certName(t.certification)}</span>
									</MenuItem>
									{/* Over the row's date while the pointer is on it */}
									<button
										type="button"
										aria-label={`${certName(t.certification)} exam on ${t.date}: change`}
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
									{certName(next.certification)}
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
