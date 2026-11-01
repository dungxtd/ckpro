import { Card, CardDescription, CardHeader, CardTitle } from "@ckpro/ui/components/card";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { Stat } from "@ckpro/ui/components/stat";
import { cn } from "@ckpro/ui/lib/utils";
import { Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { level, MAP_WEEKS, mapWeeks } from "@/components/study/data";
import { dayKey } from "@/days";

const LEVELS = [
	"bg-foreground/[0.07]",
	"bg-warning/60",
	"bg-success/35",
	"bg-success/65",
	"bg-success",
];
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
/** A week's column (a 12px square and its gap), and the weekday names before them */
const COLUMN = 15;
const LABELS = 34;
/** An element's width, followed as it changes */
function useWidth(element: HTMLElement | null) {
	const [width, setWidth] = useState(0);
	useEffect(() => {
		if (!element) return;
		const watch = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
		watch.observe(element);
		return () => watch.disconnect();
	}, [element]);
	return width;
}

/**
 * The preparation day by day, as a contribution graph: a few weeks at least,
 * from its first day to the exam (or today, without one), each day tinted by
 * its best score; today ringed, the exam day flagged; its figures beside it.
 * No day studied yet: the graph faded, and what it will show
 */
export function PrepMap({
	start,
	end,
	exam,
	best,
	pass,
	figures,
}: {
	start: Date;
	end: Date;
	exam: string | null;
	best: Map<string, number>;
	pass: number;
	figures: { days: number; streak: number; weeks: number; attempts: number };
}) {
	const today = dayKey(new Date());
	// As many weeks as the map's width holds, the latest ones
	const [area, setArea] = useState<HTMLDivElement | null>(null);
	const width = useWidth(area);
	const fit = width ? Math.max(4, Math.floor((width - LABELS) / COLUMN)) : MAP_WEEKS;
	const weeks = mapWeeks(start, end, fit).slice(-fit);
	const squares = (
		<div className="flex gap-[3px]" role="img" aria-label={`${figures.days} days studied`}>
			<div className="mr-1 grid grid-rows-[12px_repeat(7,12px)] gap-[3px] text-[9px] text-muted-foreground">
				<span />
				{WEEKDAYS.map((d, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: the days of the week
					<span key={i} className="leading-3">
						{d}
					</span>
				))}
			</div>
			{weeks.map(week => (
				// A week is 12px wide whatever its month's name: the name runs over the next weeks
				<div key={dayKey(week[0])} className="grid w-3 grid-rows-[12px_repeat(7,12px)] gap-[3px]">
					<span className="whitespace-nowrap text-[9px] text-muted-foreground leading-3">
						{week[0].getDate() <= 7
							? week[0].toLocaleDateString(undefined, { month: "short" })
							: ""}
					</span>
					{week.map(day => {
						const key = dayKey(day);
						if (exam && key === exam)
							return (
								<span
									key={key}
									title={`Exam day, ${key}`}
									className="grid size-3 place-items-center rounded-[3px] bg-highlight text-highlight-foreground"
								>
									<Flag className="size-2" />
								</span>
							);
						if (key > (exam ?? today)) return <span key={key} className="size-3" />;
						const score = best.get(key);
						return (
							<span
								key={key}
								title={score === undefined ? key : `${key}: best ${Math.round(score)}%`}
								className={cn(
									"size-3 rounded-[3px]",
									key > today ? "bg-foreground/[0.03]" : LEVELS[level(score, pass)],
									key === today && "ring-[1.5px] ring-foreground"
								)}
							/>
						);
					})}
				</div>
			))}
		</div>
	);
	return (
		<Card padding="lg" className="@container">
			<CardHeader>
				<CardTitle>Prep map</CardTitle>
				{figures.days > 0 && (
					<CardDescription>
						since {start.toLocaleDateString(undefined, { day: "numeric", month: "long" })}
						{exam &&
							`, to the exam on ${new Date(`${exam}T00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long" })}`}
					</CardDescription>
				)}
			</CardHeader>
			{figures.days === 0 ? (
				<div ref={setArea}>
					<Placeholder
						sample={squares}
						title="Your study days show here"
						description="Each day tinted by its best score"
					/>
				</div>
			) : (
				<>
					{/* The figures beside the map, under it on a narrow card */}
					<div className="flex flex-col gap-3 @sm:flex-row @sm:items-center @sm:gap-6">
						<div ref={setArea} className="min-w-0 flex-1 overflow-hidden">
							{squares}
						</div>
						<div className="grid w-44 shrink-0 grid-cols-2 gap-x-3 gap-y-1 [&>div]:px-0 [&>div]:py-1">
							<Stat value={figures.days} label="days studied" />
							<Stat value={figures.streak || "–"} label="days in a row" />
							<Stat value={figures.weeks} label="weeks studied" />
							<Stat value={figures.attempts} label="attempts" />
						</div>
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
						<span className="flex items-center gap-1">
							<span className={cn("size-3 rounded-[3px]", LEVELS[0])} />
							no study
						</span>
						<span className="flex items-center gap-1">
							<span className={cn("size-3 rounded-[3px]", LEVELS[1])} />
							below the pass line
						</span>
						<span className="flex items-center gap-1">
							{LEVELS.slice(2).map(l => (
								<span key={l} className={cn("size-3 rounded-[3px]", l)} />
							))}
							passed, by score
						</span>
					</div>
				</>
			)}
		</Card>
	);
}
