import { Input } from "@ckpro/ui/components/input";
import { MenuItem, menu } from "@ckpro/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { cn } from "@ckpro/ui/lib/utils";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { parseDay } from "@/days";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import { usePlans, useStudy } from "@/stores/study";
import { errorText, examApi, type Mode, type PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { certName, shortDay } from "@/words";

const MODES = [
	{ value: "exam" as const, label: "Exam" },
	{ value: "practice" as const, label: "Practice" },
];

/** What the picker needs of a plan of its day */
type Planned = Pick<PlanView, "id" | "exam_id" | "mode">;

/**
 * Plan a day, wherever a day is planned (a day of the Calendar, Home's
 * Today): a macOS menu of the exams by certification, as that day's
 * checklist. An exam planned that day is ticked, with the way it is taken;
 * pressed, it is unplanned; any other, pressed, is planned the way the
 * switch says. An exam is planned once a day. The switch starts the way the
 * last plan was made (the first time, the way most attempts were taken);
 * Tab flips it; Enter plans (or unplans) the first exam found. It stays open
 * for more until Escape or a press outside. It reads and changes the plans
 * itself: the screens follow the study's changes. The trigger (`children`)
 * is what asked; `side`, where it opens (beside a day's column, to keep the
 * column in view)
 */
export function PlanPicker({
	day,
	side = "bottom",
	onOpenChange,
	children,
}: {
	/** YYYY-MM-DD */
	day: string;
	side?: "top" | "right" | "bottom" | "left";
	/** Told when it opens or closes */
	onOpenChange?: (open: boolean) => void;
	children: ReactNode;
}) {
	const catalog = useExam(s => s.catalog);
	const last = useSettings(s => s.settings.plan_mode);
	const update = useSettings(s => s.update);
	const history = useStudy(s => s.history);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<Mode>("exam");
	// The day's plans, read while it is open and again as the study changes
	const { plans } = usePlans(day, day, { enabled: open });
	// Changed here, ahead of the study's next read: kept until that read
	// comes (a new list), so a tick shows at once
	const [changed, setChanged] = useState<{ of: PlanView[] | null; to: Planned[] } | null>(null);
	const planned: Planned[] = changed && changed.of === plans ? changed.to : (plans ?? []);
	const busy = useRef(false);
	const field = useRef<HTMLInputElement>(null);
	const box = useRef<HTMLDivElement>(null);
	const q = query.trim().toLowerCase();
	const matches = catalog.filter(e => e.title.toLowerCase().includes(q));
	const certs = [...new Set(matches.map(e => e.certification))];
	const date = shortDay(parseDay(day));

	// How the switch starts: as last planned, else as most attempts were taken
	const usual = (): Mode => {
		if (last) return last;
		const exams = (history ?? []).filter(h => h.mode === "exam").length;
		return history?.length && exams * 2 < history.length ? "practice" : "exam";
	};
	/** Planned that day: unplanned; else planned the way the switch says */
	const toggle = async (examId: string) => {
		// One change at a time: a second press waits for the first's answer
		if (busy.current) return;
		busy.current = true;
		const plan = planned.find(p => p.exam_id === examId);
		try {
			if (plan) {
				await examApi.planRemove(plan.id);
				setChanged({ of: plans, to: planned.filter(p => p.id !== plan.id) });
			} else {
				const id = await examApi.planAdd(day, examId, mode);
				setChanged({ of: plans, to: [...planned, { id, exam_id: examId, mode }] });
				if (mode !== last) update({ plan_mode: mode });
			}
		} catch (e) {
			toast.error(errorText(e));
		} finally {
			busy.current = false;
		}
		setQuery("");
		field.current?.focus();
	};
	return (
		<Popover
			open={open}
			onOpenChange={o => {
				if (o) setMode(usual());
				setOpen(o);
				onOpenChange?.(o);
				if (!o) setQuery("");
			}}
		>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				ref={box}
				side={side}
				align="start"
				variant="menu"
				className="flex w-72 flex-col p-1.5"
				// Opened to be typed in: the field has the focus. It keeps the
				// height it opened with: shorter as it narrows, it would move
				onOpenAutoFocus={e => {
					e.preventDefault();
					field.current?.focus();
					if (box.current) box.current.style.minHeight = `${box.current.offsetHeight}px`;
				}}
			>
				<Input
					ref={field}
					type="search"
					aria-label={`Plan an exam, ${day}`}
					placeholder={`Plan on ${date}`}
					value={query}
					onChange={e => setQuery(e.target.value)}
					onKeyDown={e => {
						if (e.key === "Enter" && q && matches[0]) toggle(matches[0].id);
						// Tab: the other way, without leaving the field
						if (e.key === "Tab" && !e.shiftKey) {
							e.preventDefault();
							setMode(m => (m === "exam" ? "practice" : "exam"));
						}
					}}
					className="h-7"
				/>
				<SegmentedControl
					label="Take it as"
					value={mode}
					onChange={m => {
						setMode(m);
						field.current?.focus();
					}}
					options={MODES}
					className="mt-1.5 w-full [&>button]:flex-1"
				/>
				{certs.map(cert => (
					<div key={cert} className="mt-1 border-border border-t pt-1 first-of-type:mt-1.5">
						<div className={menu.header}>{certName(cert)}</div>
						{matches
							.filter(e => e.certification === cert)
							.map(e => {
								const plan = planned.find(p => p.exam_id === e.id);
								return (
									<MenuItem
										key={e.id}
										pressed={!!plan}
										title={plan ? "Planned: press to unplan it" : undefined}
										onClick={() => toggle(e.id)}
										hint={plan ? plan.mode : `${e.duration_minutes} min`}
										hintClassName={cn(
											plan?.mode === "exam" && "text-highlight opacity-100 [:hover>&]:text-current"
										)}
										className={cn(
											// What Enter would change is marked while typing
											e === matches[0] && q && "bg-highlight/20",
											// Pressed, a ticked one goes: said in the warning colour
											plan && "hover:bg-warning/85"
										)}
									>
										{shortTitle(e.title)}
									</MenuItem>
								);
							})}
					</div>
				))}
				{!matches.length && (
					<p className="px-2 py-2 text-caption text-muted-foreground">No exam has that.</p>
				)}
				<p className="mt-1 border-border border-t px-2.5 pt-1.5 pb-0.5 text-2xs text-muted-foreground">
					{planned.length
						? `${planned.length} planned on this day · press a ticked one to unplan it`
						: "Nothing planned on this day yet"}
				</p>
			</PopoverContent>
		</Popover>
	);
}
