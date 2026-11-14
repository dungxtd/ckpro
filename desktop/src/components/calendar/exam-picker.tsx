import { Input } from "@ckpro/ui/components/input";
import { menu, menuRow } from "@ckpro/ui/components/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ckpro/ui/components/popover";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import { cn } from "@ckpro/ui/lib/utils";
import { type ReactNode, useRef, useState } from "react";
import { useExam } from "@/stores/exam";
import { useSettings } from "@/stores/settings";
import { useStudy } from "@/stores/study";
import type { Mode } from "@/tauri/api";
import { shortTitle } from "@/titles";

const MODES = [
	{ value: "exam" as const, label: "Exam" },
	{ value: "practice" as const, label: "Practice" },
];

/**
 * Pick an exam to plan on a day, as a macOS menu: a field that narrows the
 * exams, a switch for taking it as an exam or as practice, then the exams by
 * certification. The switch starts the way the last plan was made (the first
 * time, the way most attempts were taken); Tab flips it, Enter plans the
 * first exam, a click the one clicked. The trigger (`children`) is what asked
 */
export function ExamPicker({
	label,
	onPick,
	onOpenChange,
	children,
}: {
	label: string;
	/** Told when it opens or closes */
	onOpenChange?: (open: boolean) => void;
	onPick: (examId: string, mode: Mode) => void;
	children: ReactNode;
}) {
	const catalog = useExam(s => s.catalog);
	const last = useSettings(s => s.settings.plan_mode);
	const update = useSettings(s => s.update);
	const history = useStudy(s => s.history);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<Mode>("exam");
	const field = useRef<HTMLInputElement>(null);
	const box = useRef<HTMLDivElement>(null);
	const q = query.trim().toLowerCase();
	const matches = catalog.filter(e => e.title.toLowerCase().includes(q));
	const certs = [...new Set(matches.map(e => e.certification))];
	// How the switch starts: as last planned, else as most attempts were taken
	const usual = (): Mode => {
		if (last) return last;
		const exams = (history ?? []).filter(h => h.mode === "exam").length;
		return history?.length && exams * 2 < history.length ? "practice" : "exam";
	};
	const pick = (id: string) => {
		onPick(id, mode);
		if (mode !== last) update({ plan_mode: mode });
		setOpen(false);
		setQuery("");
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
				className={cn(menu.surface, "flex w-72 flex-col p-1.5")}
				// Opened to be typed in: the field has the focus. It keeps the
				// height it opened with: shorter as it narrows, it would move to
				// the other side of the day
				onOpenAutoFocus={e => {
					e.preventDefault();
					field.current?.focus();
					if (box.current) box.current.style.minHeight = `${box.current.offsetHeight}px`;
				}}
			>
				<Input
					ref={field}
					type="search"
					aria-label={label}
					placeholder={label}
					value={query}
					onChange={e => setQuery(e.target.value)}
					onKeyDown={e => {
						if (e.key === "Enter" && matches[0]) pick(matches[0].id);
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
						<div className={menu.header}>{cert.toUpperCase()}</div>
						{matches
							.filter(e => e.certification === cert)
							.map(e => (
								<button
									key={e.id}
									type="button"
									onClick={() => pick(e.id)}
									// What Enter would plan is marked while typing
									className={menuRow(cn("pl-2.5", e === matches[0] && q && "bg-highlight/20"))}
								>
									<span className={menu.label}>{shortTitle(e.title)}</span>
									<span className={menu.hint}>{e.duration_minutes} min</span>
								</button>
							))}
					</div>
				))}
				{!matches.length && (
					<p className="px-2 py-2 text-caption text-muted-foreground">No exam has that.</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
