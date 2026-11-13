import { useScrollEdges } from "@ckpro/ui/hooks/use-scroll-edges";
import { reducedMotion } from "@ckpro/ui/lib/motion";
import { cn } from "@ckpro/ui/lib/utils";
import type * as React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { activityLevel, level, MAP_WEEKS, mapWeeks } from "@/components/study/data";
import { addDays, dayKey, parseDay } from "@/days";
import type { ExamTarget } from "@/tauri/api";

/** Where an element starts along the scroller's content (its scroll offset
 * included), whatever is positioned between them */
const leftIn = (scroller: HTMLElement, el: HTMLElement) =>
	el.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;

/** A day's tint by time practised (less → more) or by best score (the pass line) */
const ACTIVITY = ["bg-fill-quiet", "bg-success/30", "bg-success/55", "bg-success/80", "bg-success"];
const SCORE = ["bg-fill-quiet", "bg-warning/60", "bg-success/35", "bg-success/65", "bg-success"];
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
/** Plans this far ahead are drawn quietly: the next two weeks stand out */
const NEAR_DAYS = 14;

const label = (d: Date) =>
	d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const short = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * The preparation day by day, as a contribution graph, from its first day
 * to the last exam aimed at: the past tinted by time practised (`activity`)
 * or by best score (`score`), planned days ringed, exam days filled, today
 * ringed. Squares keep their size: a longer preparation scrolls sideways,
 * opened with today two-thirds across, fading where there is more, and a chip
 * at the edge reaches the next exam out of view. With `lanes`, each exam's
 * preparation is a bar over the weeks. A day picked opens it (`onPick`)
 */
export function PracticeMap({
	mode,
	start,
	exams,
	minutes,
	best,
	pass,
	planned,
	lanes = false,
	cell = 13,
	picked,
	onPick,
	className,
}: {
	mode: "activity" | "score";
	/** The preparation's first day */
	start: Date;
	/** The exams shown */
	exams: ExamTarget[];
	minutes: Map<string, number>;
	best: Map<string, number>;
	pass: number;
	/** Planned days: the certifications planned for */
	planned: Map<string, string[]>;
	lanes?: boolean;
	/** A square's side, px */
	cell?: number;
	picked?: string | null;
	onPick?: (day: string) => void;
	className?: string;
}) {
	const now = new Date();
	const today = dayKey(now);
	const lastExam = exams.reduce<string | null>((l, e) => (!l || e.date > l ? e.date : l), null);
	const end = lastExam && lastExam > today ? parseDay(lastExam) : now;
	const weeks = mapWeeks(start, end, MAP_WEEKS);
	const first = dayKey(start);
	const examOn = new Map(exams.map(e => [e.date, e]));
	const [scroller, scrollEl] = useScrollEdges<HTMLDivElement>("x");
	const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
	const area = useRef<HTMLDivElement>(null);
	// The next exam past the right edge, reached from a chip
	const [ahead, setAhead] = useState<ExamTarget | null>(null);
	// The map scrolled by the chip, the pointer not moved since: no tips
	const quiet = useRef(false);

	const describe = (d: Date): string => {
		const k = dayKey(d);
		const exam = examOn.get(k);
		if (exam) return `${exam.certification.toUpperCase()} exam · ${label(d)}`;
		if (k <= today) {
			if (mode === "activity") {
				const m = minutes.get(k);
				return m ? `${m} min practised · ${label(d)}` : `No practice · ${label(d)}`;
			}
			const b = best.get(k);
			return b === undefined ? `No practice · ${label(d)}` : `Best ${Math.round(b)}% · ${label(d)}`;
		}
		const plans = planned.get(k);
		return plans?.length
			? `Planned${exams.length > 1 ? ` for ${plans.map(c => c.toUpperCase()).join(", ")}` : ""} · ${label(d)}`
			: label(d);
	};

	// Opened with today two-thirds across; after that the candidate scrolls
	const placed = useRef(false);
	useLayoutEffect(() => {
		const el = scrollEl;
		if (!el || placed.current) return;
		const todayCell = el.querySelector<HTMLElement>(`[data-day="${today}"]`);
		if (!todayCell || !el.clientWidth) return;
		el.scrollLeft = leftIn(el, todayCell) - (el.clientWidth * 2) / 3;
		placed.current = true;
	});
	// Which exam lies past the right edge, as the map scrolls or resizes
	useLayoutEffect(() => {
		const el = scrollEl;
		if (!el) return;
		const look = () => {
			const edge = el.scrollLeft + el.clientWidth;
			const next = [...examOn.values()]
				.sort((a, b) => a.date.localeCompare(b.date))
				.find(e => {
					const c = el.querySelector<HTMLElement>(`[data-day="${e.date}"]`);
					return c && leftIn(el, c) + c.offsetWidth > edge;
				});
			setAhead(a => (a?.date === next?.date ? a : (next ?? null)));
		};
		look();
		el.addEventListener("scroll", look, { passive: true });
		const watch = new ResizeObserver(look);
		watch.observe(el);
		return () => {
			el.removeEventListener("scroll", look);
			watch.disconnect();
		};
	});

	const show = (target: HTMLElement) => {
		const text = target.dataset.tip;
		const box = area.current?.getBoundingClientRect();
		if (!text || !box) return setTip(null);
		const r = target.getBoundingClientRect();
		setTip({ text, x: r.left - box.left + r.width / 2, y: r.top - box.top });
	};
	// Arrow keys walk the days: a week sideways, a day up and down
	const walk = (e: React.KeyboardEvent) => {
		const day = (e.target as HTMLElement).dataset.day;
		const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
		if (!day || !step) return;
		e.preventDefault();
		const next = scrollEl?.querySelector<HTMLElement>(
			`[data-day="${dayKey(addDays(parseDay(day), step))}"]`
		);
		next?.focus();
	};

	const week = (d: string) => weeks.findIndex(w => dayKey(w[6]) >= d);
	const shownLanes = lanes && exams.length > 1 ? exams : [];
	const tints = mode === "activity" ? ACTIVITY : SCORE;
	const columns = `repeat(${weeks.length}, ${cell}px)`;
	const rows = `12px repeat(7, ${cell}px)`;

	return (
		<div ref={area} className={cn("relative flex min-w-0 flex-col gap-2", className)}>
			<div className="flex gap-1.5">
				{/* The weekday names stay as the weeks scroll */}
				<div
					className="grid shrink-0 gap-[3px] text-3xs text-muted-foreground"
					style={{
						gridTemplateRows: rows,
						paddingTop: shownLanes.length * 17,
						lineHeight: `${cell}px`,
					}}
				>
					<span />
					{WEEKDAYS.map((d, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the days of the week
						<span key={i}>{d}</span>
					))}
				</div>
				<div
					ref={scroller}
					className="no-scrollbar fade-x min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
				>
					<div className="w-max">
						{shownLanes.length > 0 && (
							<div
								className="mb-[3px] grid auto-rows-[14px] gap-x-[3px] gap-y-[3px]"
								style={{ gridTemplateColumns: columns }}
							>
								{shownLanes.map((e, i) => (
									<span
										key={e.certification}
										className={cn(
											"truncate rounded-sm bg-highlight/15 px-1.5 text-3xs text-foreground leading-[14px]",
											e.date < today && "opacity-50"
										)}
										style={{
											gridRow: i + 1,
											gridColumn: `${Math.max(0, week(e.started)) + 1} / ${Math.max(0, week(e.date)) + 2}`,
										}}
									>
										{e.certification.toUpperCase()} · {short(parseDay(e.date))}
									</span>
								))}
							</div>
						)}
						{/* biome-ignore lint/a11y/useSemanticElements: a group of day buttons, not a form */}
						<div
							role="group"
							aria-label={mode === "activity" ? "Practice by day" : "Best score by day"}
							className="grid grid-flow-col gap-[3px]"
							style={{ gridTemplateColumns: columns, gridTemplateRows: rows }}
							onPointerMove={() => {
								quiet.current = false;
							}}
							onPointerOver={e => {
								// Days sliding under a pointer that has not moved say nothing
								if (quiet.current) return;
								const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
								if (t) show(t);
							}}
							onPointerLeave={() => setTip(null)}
							onKeyDown={walk}
						>
							{weeks.map((w, i) => [
								<span
									key={`m${dayKey(w[0])}`}
									className="whitespace-nowrap text-3xs text-muted-foreground leading-3"
									style={{ width: cell }}
								>
									{w[0].getDate() <= 7 || (i === 0 && w[0].getDate() <= 21)
										? w[0].toLocaleDateString(undefined, { month: "short" })
										: ""}
								</span>,
								...w.map(d => {
									const k = dayKey(d);
									const out = k < first || (lastExam ? k > lastExam && k > today : k > today);
									if (out && k > today) return <span key={k} aria-hidden />;
									const exam = examOn.get(k);
									const past = k <= today;
									const plans = planned.get(k);
									const tint = exam
										? "bg-highlight"
										: past
											? tints[
													mode === "activity"
														? activityLevel(minutes.get(k))
														: level(best.get(k), pass)
												]
											: plans?.length
												? cn(
														"ring-[1.5px] ring-inset",
														parseDay(k).getTime() - now.getTime() > NEAR_DAYS * 86_400_000
															? "ring-highlight/35"
															: "ring-highlight"
													)
												: "bg-fill-quiet/50";
									const text = describe(d);
									const square = cn(
										"block rounded-[3px] outline-none",
										tint,
										out && "opacity-40",
										k === today && "ring-[1.5px] ring-foreground ring-inset",
										k === picked && "outline-2 outline-highlight outline-offset-1",
										onPick && "cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
									);
									return onPick ? (
										<button
											key={k}
											type="button"
											data-day={k}
											data-tip={text}
											aria-label={text}
											tabIndex={k === (picked ?? today) ? 0 : -1}
											className={square}
											style={{ width: cell, height: cell }}
											onClick={() => onPick(k)}
											onFocus={e => show(e.currentTarget)}
											onBlur={() => setTip(null)}
										/>
									) : (
										<span
											key={k}
											data-day={k}
											data-tip={text}
											className={square}
											style={{ width: cell, height: cell }}
										/>
									);
								}),
							])}
						</div>
					</div>
				</div>
				{ahead && (
					<button
						type="button"
						className="absolute top-1/2 right-0 -translate-y-1/2 rounded-full bg-highlight px-2.5 py-0.5 font-semibold text-2xs text-highlight-foreground shadow-(--shadow-control)"
						onClick={() => {
							const c = scrollEl?.querySelector<HTMLElement>(`[data-day="${ahead.date}"]`);
							if (!c || !scrollEl) return;
							// Off the chip: no tip left over, and the chip goes once the day is in view
							setTip(null);
							setAhead(null);
							quiet.current = true;
							const still = reducedMotion();
							// The exam day in the middle of the map, clear of the faded edges
							scrollEl.scrollTo({
								left: leftIn(scrollEl, c) - scrollEl.clientWidth / 2,
								behavior: still ? "auto" : "smooth",
							});
							// The exam day lights up once the map has got there: inside its own
							// square, so the map's edges never cut it
							const flash = () =>
								c.animate(
									[
										{ boxShadow: "inset 0 0 0 0 var(--color-foreground)", opacity: 1 },
										{ boxShadow: "inset 0 0 0 2px var(--color-foreground)", opacity: 0.45 },
										{ boxShadow: "inset 0 0 0 0 var(--color-foreground)", opacity: 1 },
									],
									{ duration: 700, easing: "ease-in-out" }
								);
							// After the smooth scroll (a timer: not every web view tells when a scroll ends)
							setTimeout(flash, still ? 0 : 450);
						}}
					>
						{ahead.certification.toUpperCase()} {short(parseDay(ahead.date))} ›
					</button>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
				{mode === "activity" ? (
					<span className="flex items-center gap-1">
						Less
						{ACTIVITY.map(t => (
							<i key={t} className={cn("size-2.5 rounded-[2px]", t)} />
						))}
						More
					</span>
				) : (
					<>
						<Key tint="bg-success">passed</Key>
						<Key tint="bg-warning/60">below the pass line</Key>
					</>
				)}
				<span className="flex-1" />
				<Key tint="ring-[1.5px] ring-highlight ring-inset">planned</Key>
				<Key tint="bg-highlight">exam</Key>
			</div>
			{tip && (
				<div
					role="tooltip"
					className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-2xs text-background"
					style={{ left: tip.x, top: tip.y - 6 }}
				>
					{tip.text}
				</div>
			)}
		</div>
	);
}

function Key({ tint, children }: { tint: string; children: React.ReactNode }) {
	return (
		<span className="flex items-center gap-1">
			<i className={cn("size-2.5 rounded-[2px]", tint)} />
			{children}
		</span>
	);
}
