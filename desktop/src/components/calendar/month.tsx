import { Badge } from "@ckdry/ui/components/badge";
import { IconButton } from "@ckdry/ui/components/icon-button";
import { cn } from "@ckdry/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shortTitle } from "@/components/catalog/exams";
import type { HistoryEntry } from "@/tauri/api";
import { dayKey, monthWeeks } from "./days";

const WEEKDAYS = monthWeeks(new Date(2026, 9, 1))[0].map(d =>
	d.toLocaleDateString(undefined, { weekday: "short" })
);

/**
 * A month of study: each day with the attempts started on it (two named,
 * then how many more). Days of the next and last month are faint
 */
export function Month({
	month,
	days,
	today,
	picked,
	onPick,
}: {
	month: Date;
	days: Map<string, HistoryEntry[]>;
	today: string;
	picked: string | null;
	onPick: (day: string) => void;
}) {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card">
			<div className="grid grid-cols-7 border-border border-b">
				{WEEKDAYS.map(name => (
					<div key={name} className="px-2 py-1.5 text-caption text-muted-foreground">
						{name}
					</div>
				))}
			</div>
			{monthWeeks(month).map(week => (
				<div key={dayKey(week[0])} className="grid grid-cols-7 border-border not-last:border-b">
					{week.map(day => {
						const key = dayKey(day);
						const attempts = days.get(key) ?? [];
						const inMonth = day.getMonth() === month.getMonth();
						return (
							<button
								key={key}
								type="button"
								aria-pressed={picked === key}
								aria-label={`${day.toLocaleDateString(undefined, { dateStyle: "full" })}: ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`}
								onClick={() => onPick(key)}
								className={cn(
									"flex min-h-24 min-w-0 flex-col gap-1 border-border p-1.5 text-left outline-none not-last:border-r hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-pressed:bg-sidebar-selected",
									!inMonth && "text-muted-foreground/60"
								)}
							>
								<span
									className={cn(
										"grid size-6 place-items-center rounded-full text-caption tabular-nums",
										key === today && "bg-highlight font-semibold text-highlight-foreground"
									)}
								>
									{day.getDate()}
								</span>
								{attempts.slice(0, 2).map(h => (
									<span
										key={h.attempt_id}
										className={cn(
											"truncate rounded px-1 py-px text-2xs",
											h.result.passed ? "bg-success/15 text-success" : "bg-foreground/[0.07]"
										)}
									>
										{h.result.score ?? 0}% {shortTitle(h.title)}
									</span>
								))}
								{attempts.length > 2 && (
									<span className="px-1 text-2xs text-muted-foreground">
										{attempts.length - 2} more
									</span>
								)}
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}

/**
 * The month small, beside a day's attempts: days with attempts tinted, the
 * picked one filled, today ringed; its own arrows change the month
 */
export function MiniMonth({
	month,
	days,
	today,
	picked,
	onPick,
	onShift,
}: {
	month: Date;
	days: Map<string, HistoryEntry[]>;
	today: string;
	picked: string;
	onPick: (day: string) => void;
	onShift: (by: number) => void;
}) {
	return (
		<div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-callout">
					{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
				</span>
				<div className="flex">
					<IconButton
						variant="toolbar"
						size="xs"
						aria-label="Previous month"
						onClick={() => onShift(-1)}
					>
						<ChevronLeft />
					</IconButton>
					<IconButton
						variant="toolbar"
						size="xs"
						aria-label="Next month"
						onClick={() => onShift(1)}
					>
						<ChevronRight />
					</IconButton>
				</div>
			</div>
			<div className="grid grid-cols-7 gap-y-1 text-center">
				{WEEKDAYS.map(name => (
					<span key={name} className="text-2xs text-muted-foreground">
						{name.slice(0, 2)}
					</span>
				))}
				{monthWeeks(month)
					.flat()
					.map(day => {
						const key = dayKey(day);
						const count = days.get(key)?.length ?? 0;
						return (
							<button
								key={key}
								type="button"
								aria-pressed={picked === key}
								aria-label={`${day.toLocaleDateString(undefined, { dateStyle: "full" })}: ${count} attempt${count === 1 ? "" : "s"}`}
								onClick={() => onPick(key)}
								className={cn(
									"mx-auto grid size-8 place-items-center rounded-full text-caption tabular-nums outline-none transition-colors duration-150 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
									day.getMonth() !== month.getMonth() && "text-muted-foreground/50",
									count > 0 && "bg-foreground/[0.08] font-semibold",
									key === today && "ring-1 ring-highlight",
									picked === key && "bg-highlight text-highlight-foreground hover:bg-highlight"
								)}
							>
								{day.getDate()}
							</button>
						);
					})}
			</div>
		</div>
	);
}

/** A day's attempts, one card each: the exam, how it was taken, its score */
export function DayAttempts({ day, attempts }: { day: string; attempts: HistoryEntry[] }) {
	return (
		<section className="flex min-w-0 flex-col gap-3">
			<h2 className="font-semibold text-lead">
				{new Date(`${day}T00:00`).toLocaleDateString(undefined, { dateStyle: "full" })}
			</h2>
			{attempts.length === 0 ? (
				<p className="text-callout text-muted-foreground">No attempt on this day.</p>
			) : (
				attempts.map(h => (
					<div
						key={h.attempt_id}
						className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3"
					>
						<div className="min-w-0 flex-1">
							<div className="truncate font-medium">{h.title}</div>
							<div className="mt-0.5 flex items-center gap-2 text-caption text-muted-foreground">
								<Badge>{h.mode === "exam" ? "Exam" : "Practice"}</Badge>
								<span className="tabular-nums">{span(h)}</span>
							</div>
						</div>
						<div className="text-right">
							<div className="font-semibold text-xl tabular-nums">{h.result.score ?? 0}%</div>
							<Badge variant={h.result.passed ? "success" : "destructive"}>
								{h.result.passed ? "Pass" : "Fail"}
							</Badge>
						</div>
					</div>
				))
			)}
		</section>
	);
}

const time = (ms: number) =>
	new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** When an attempt ran: its start, and its end when known */
const span = (h: HistoryEntry) =>
	h.result.finished_at
		? `${time(h.result.started_at ?? 0)} to ${time(h.result.finished_at)}`
		: time(h.result.started_at ?? 0);
