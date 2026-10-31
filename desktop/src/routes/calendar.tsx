import { Button } from "@ckdry/ui/components/button";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { Loading } from "@ckdry/ui/components/loading";
import { Stat, StatGroup } from "@ckdry/ui/components/stat";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { byDay, dayKey, monthKey, parseMonth, streak } from "@/components/calendar/days";
import { DayAttempts, MiniMonth, Month } from "@/components/calendar/month";
import { Screen } from "@/components/shell/screen";
import { examApi, type HistoryEntry } from "@/tauri/api";

/**
 * When the candidate studied: every finished attempt on the day it started,
 * a month at a time, with the month's figures and the current streak. The
 * month and the day picked are in the URL
 */
export function CalendarRoute() {
	const [history, setHistory] = useState<HistoryEntry[] | null>(null);
	const [params, setParams] = useSearchParams();
	useEffect(() => {
		examApi.history().then(setHistory);
	}, []);

	const now = new Date();
	const today = dayKey(now);
	const month = parseMonth(params.get("month")) ?? new Date(now.getFullYear(), now.getMonth(), 1);
	const picked = params.get("day");
	const go = (to: Date) => setParams({ month: monthKey(to) });
	const shift = (by: number) => go(new Date(month.getFullYear(), month.getMonth() + by, 1));

	if (history === null) return <Loading fill label="Loading your attempts…" />;
	if (history.length === 0)
		return (
			<Screen title="Calendar">
				<div className="flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
					<CalendarDays className="size-8" />
					<p className="text-callout">The study calendar fills in as you finish attempts.</p>
				</div>
			</Screen>
		);

	const days = byDay(history);
	const inMonth = [...days].filter(([key]) => key.startsWith(monthKey(month)));
	const attempts = inMonth.flatMap(([, list]) => list);
	const scored = attempts.filter(h => h.result.score !== null);
	const average = scored.length
		? Math.round(scored.reduce((sum, h) => sum + (h.result.score ?? 0), 0) / scored.length)
		: null;
	const run = streak(new Set(days.keys()), now);
	const onDay = picked ? (days.get(picked) ?? []) : [];

	return (
		<Screen
			title="Calendar"
			actions={
				picked ? (
					<Button size="push" variant="push" onClick={() => setParams({ month: monthKey(month) })}>
						<CalendarDays /> Month
					</Button>
				) : (
					<div className="flex items-center gap-1">
						<span className="mr-2 font-semibold text-lead tabular-nums">
							{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
						</span>
						<IconButton
							variant="toolbar"
							size="sm"
							aria-label="Previous month"
							onClick={() => shift(-1)}
						>
							<ChevronLeft />
						</IconButton>
						<Button size="push" variant="push" onClick={() => go(now)}>
							Today
						</Button>
						<IconButton
							variant="toolbar"
							size="sm"
							aria-label="Next month"
							onClick={() => shift(1)}
						>
							<ChevronRight />
						</IconButton>
					</div>
				)
			}
		>
			<StatGroup>
				<Stat
					value={inMonth.length}
					label={inMonth.length === 1 ? "day studied" : "days studied"}
				/>
				<Stat value={attempts.length} label={attempts.length === 1 ? "attempt" : "attempts"} />
				<Stat value={average === null ? "–" : `${average}%`} label="average score" />
				<Stat value={run} label={run === 1 ? "day in a row" : "days in a row"} />
			</StatGroup>
			{picked ? (
				// A day picked: the month small beside it (staying as the list
				// scrolls), the day's attempts on the right
				<div className="grid grid-cols-[272px_minmax(0,1fr)] items-start gap-6">
					<div className="sticky top-0">
						<MiniMonth
							month={month}
							days={days}
							today={today}
							picked={picked}
							onPick={day => setParams({ month: monthKey(month), day })}
							onShift={by =>
								setParams({
									month: monthKey(new Date(month.getFullYear(), month.getMonth() + by, 1)),
									day: picked,
								})
							}
						/>
					</div>
					<DayAttempts day={picked} attempts={onDay} />
				</div>
			) : (
				<Month
					month={month}
					days={days}
					today={today}
					picked={picked}
					onPick={day => setParams({ month: monthKey(month), day })}
				/>
			)}
		</Screen>
	);
}
