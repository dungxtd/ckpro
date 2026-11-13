import { Button } from "@ckpro/ui/components/button";
import { Card } from "@ckpro/ui/components/card";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { Progress, ProgressRing } from "@ckpro/ui/components/progress";
import { Textarea } from "@ckpro/ui/components/textarea";
import { useScrollEdges } from "@ckpro/ui/hooks/use-scroll-edges";
import { cn } from "@ckpro/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AssistantIcon } from "@/components/assistant/assistant-icon";
import {
	daysUntil,
	passed,
	type Retry,
	scoreColor,
	scoreOf,
	scoreTone,
	startedAt,
	worked,
} from "@/components/study/data";
import { addDays, dayKey, parseDay } from "@/days";
import { useExam, useExamBusy } from "@/stores/exam";
import type { ExamReadiness, ExamTarget, HistoryEntry, PlanView } from "@/tauri/api";
import { shortTitle } from "@/titles";
import { domainName, plural } from "@/words";

/** A module's surface: its title, a link to the screen with all of it, then its content */
export function ModuleCard({
	title,
	link,
	className,
	children,
}: {
	title?: React.ReactNode;
	link?: { to: string; label: string };
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Card
			variant="tinted"
			padding="md"
			className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-2xl", className)}
		>
			{(title || link) && (
				<div className="mb-2 flex shrink-0 items-baseline gap-2">
					{title && <h2 className="min-w-0 truncate font-semibold text-callout">{title}</h2>}
					{link && (
						<Link
							to={link.to}
							className="ml-auto flex shrink-0 items-center text-caption text-highlight hover:underline"
						>
							{link.label}
							<ChevronRight className="size-3.5" />
						</Link>
					)}
				</div>
			)}
			{children}
		</Card>
	);
}

/** A list taller than its module: it scrolls, the next item fading at the edge */
export function ModuleScroll({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	const [ref] = useScrollEdges<HTMLDivElement>("y");
	return (
		<div
			ref={ref}
			className={cn(
				"no-scrollbar fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain",
				className
			)}
		>
			{children}
		</div>
	);
}

const cert = (c: string) => c.toUpperCase();
const fullDay = (day: string) =>
	parseDay(day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/** How many days to each exam aimed at: the nearest large; several side by
 * side; one with how far the preparation has come */
export function ExamDay({ targets }: { targets: ExamTarget[] }) {
	const now = new Date();
	if (targets.length === 0)
		return (
			<ModuleCard title="Exam day">
				<p className="text-caption text-muted-foreground">
					Set the day of the exam you prepare for
				</p>
				<Button asChild size="push" variant="push" className="mt-auto self-start">
					<Link to="/calendar">Set it in Calendar</Link>
				</Button>
			</ModuleCard>
		);
	if (targets.length > 1)
		return (
			<ModuleCard>
				<div className="grid h-full auto-cols-fr grid-flow-col divide-x divide-border">
					{targets.map(t => (
						<div key={t.certification} className="flex min-w-0 flex-col px-3 first:pl-0 last:pr-0">
							<span className="font-semibold text-title tabular-nums leading-none">
								{Math.max(0, daysUntil(t.date, now))}
							</span>
							<span className="text-caption text-muted-foreground">
								days to <b className="text-foreground">{cert(t.certification)}</b>
							</span>
							<span className="mt-auto truncate text-caption text-muted-foreground">
								{fullDay(t.date)}
							</span>
						</div>
					))}
				</div>
			</ModuleCard>
		);
	const t = targets[0];
	const total = Math.max(1, daysUntil(t.date, parseDay(t.started)));
	const done = Math.min(total, Math.max(0, total - daysUntil(t.date, now)));
	const share = Math.round((done * 100) / total);
	return (
		<ModuleCard>
			<div className="flex items-baseline gap-2.5">
				<span className="font-semibold text-title tabular-nums leading-none">
					{Math.max(0, daysUntil(t.date, now))}
				</span>
				<span className="truncate text-caption text-muted-foreground">
					days to <b className="text-foreground">{cert(t.certification)}</b> · {fullDay(t.date)}
				</span>
			</div>
			<div className="mt-auto">
				<Progress value={share} label="The preparation so far" />
				<div className="mt-1.5 flex justify-between text-caption text-muted-foreground tabular-nums">
					<span>
						Day {done} of {total} of your preparation
					</span>
					<span>{share}%</span>
				</div>
			</div>
		</ModuleCard>
	);
}

export type Measured = {
	certification: string;
	readiness: ExamReadiness | null;
	state: "reading" | "read" | "failed";
};

/** How ready the candidate is: a ring for one exam, a bar per exam for several */
export function Readiness({ measured, onRetry }: { measured: Measured[]; onRetry: () => void }) {
	const failed = measured.some(m => m.state === "failed");
	if (measured.length === 0 || failed)
		return (
			<ModuleCard title="Readiness">
				<p className="text-caption text-muted-foreground">
					{failed ? "Could not read your readiness" : "Shows once there is an exam to measure"}
				</p>
				{failed && (
					<Button size="push" variant="push" className="mt-auto self-start" onClick={onRetry}>
						Try again
					</Button>
				)}
			</ModuleCard>
		);
	if (measured.length === 1) {
		const r = measured[0].readiness;
		const score = r?.predicted ?? null;
		return (
			<ModuleCard>
				<div className="flex h-full items-center gap-3">
					<ProgressRing value={score ?? 0} label="Predicted score" className="size-[72px]">
						<span className="text-callout">{score === null ? "–" : `${Math.round(score)}%`}</span>
					</ProgressRing>
					<div className="min-w-0">
						<div className="font-semibold text-callout">Readiness</div>
						<div className="text-caption text-muted-foreground">
							{cert(measured[0].certification)} · pass {r?.pass_score ?? 66}%
						</div>
						{score === null && (
							<div className="text-caption text-muted-foreground">
								{r
									? `${r.coverage}% measured`
									: measured[0].state === "reading"
										? ""
										: "Not measured"}
							</div>
						)}
					</div>
				</div>
			</ModuleCard>
		);
	}
	return (
		<ModuleCard title="Readiness">
			<div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.5rem] items-center gap-x-2 gap-y-1.5 text-caption">
				{measured.map(m => {
					const score = m.readiness?.predicted ?? null;
					const pass = m.readiness?.pass_score ?? 66;
					return (
						<div key={m.certification} className="contents">
							<span>{cert(m.certification)}</span>
							{score === null ? (
								<span className="col-span-2 text-muted-foreground">not measured</span>
							) : (
								<>
									<Progress
										value={score}
										marker={pass}
										tone={scoreTone(score, pass)}
										label={`${cert(m.certification)} predicted`}
									/>
									<b className="text-right tabular-nums">{Math.round(score)}%</b>
								</>
							)}
						</div>
					);
				})}
			</div>
		</ModuleCard>
	);
}

/** Every domain against the pass line, weakest first: one exam's, or each
 * exam's in turn; a long list scrolls */
export function Domains({
	measured,
	onRetry,
	onMeasure,
}: {
	measured: Measured[];
	onRetry: () => void;
	onMeasure: (() => void) | null;
}) {
	const groups = measured.map(m => ({
		...m,
		domains: (m.readiness?.domains ?? [])
			.filter(d => d.max_points > 0)
			.sort((a, b) => a.points / a.max_points - b.points / b.max_points),
	}));
	const any = groups.some(g => g.domains.length > 0);
	const failed = groups.some(g => g.state === "failed");
	const reading = groups.some(g => g.state === "reading");
	return (
		<ModuleCard title="Domains">
			{!any ? (
				<Placeholder
					sample={
						<div className="flex flex-col gap-2">
							{[60, 45, 80, 35].map((v, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: a fixed sample
								<Progress key={i} value={v} label="domain" />
							))}
						</div>
					}
					title={
						reading
							? undefined
							: failed
								? "Could not read your domains"
								: "Take a full mock to measure"
					}
					action={
						failed ? (
							<Button size="push" variant="push" onClick={onRetry}>
								Try again
							</Button>
						) : (
							!reading &&
							onMeasure && (
								<Button size="push" variant="push" onClick={onMeasure}>
									Open an exam
								</Button>
							)
						)
					}
				/>
			) : (
				<ModuleScroll>
					{groups.map(g => (
						<div key={g.certification} className="mb-2 flex flex-col gap-1.5">
							{groups.length > 1 && (
								<div className="text-2xs text-muted-foreground">{cert(g.certification)}</div>
							)}
							{g.domains.map(d => {
								const percent = (d.points * 100) / d.max_points;
								const pass = g.readiness?.pass_score ?? 66;
								return (
									<div key={d.domain} className="flex flex-col gap-1 text-caption">
										<div className="flex justify-between gap-2">
											<span className="truncate capitalize">{domainName(d.domain)}</span>
											<span className="text-muted-foreground tabular-nums">
												{Math.round(percent)}%
											</span>
										</div>
										<Progress
											value={percent}
											marker={pass}
											tone={scoreTone(percent, pass)}
											label={`${domainName(d.domain)} score`}
										/>
									</div>
								);
							})}
						</div>
					))}
				</ModuleScroll>
			)}
		</ModuleCard>
	);
}

/** Attempts passed, and the best */
export function Passed({ history }: { history: HistoryEntry[] }) {
	const figures = passed(history);
	return (
		<ModuleCard>
			<span className="font-semibold text-success text-title tabular-nums leading-none">
				{figures.passed}
			</span>
			<span className="text-caption text-muted-foreground">
				of {plural(figures.of, "attempt")} passed
			</span>
			{figures.best && (
				<span className="mt-auto truncate text-caption text-muted-foreground">
					best {Math.round(scoreOf(figures.best))}% · {shortTitle(figures.best.title)}
				</span>
			)}
		</ModuleCard>
	);
}

/** The questions whose last try failed checks, as a shelf; one practised from its card */
export function RetryList({ retries, several }: { retries: Retry[]; several: boolean }) {
	const [ref] = useScrollEdges<HTMLDivElement>("x");
	const start = useExam(s => s.start);
	const busy = useExamBusy();
	return (
		<ModuleCard
			title="Retry list"
			link={retries.length ? { to: "/history", label: `All ${retries.length}` } : undefined}
		>
			<p className="mb-2 text-caption text-muted-foreground">
				{retries.length
					? "Questions whose checks failed the last time"
					: "Questions whose checks fail come back here"}
			</p>
			{retries.length > 0 && (
				<div
					ref={ref}
					className="no-scrollbar fade-x -mx-1 flex min-h-0 flex-1 gap-2.5 overflow-x-auto px-1"
				>
					{retries.slice(0, 12).map(r => (
						<button
							key={r.id}
							type="button"
							disabled={busy}
							onClick={() => start(r.examId, "practice")}
							aria-label={`Practise ${shortTitle(r.title)} again`}
							className="flex w-36 shrink-0 flex-col justify-between rounded-xl bg-fill-quiet p-2.5 text-left hover:bg-hover disabled:opacity-60"
						>
							<b className="line-clamp-3 font-semibold text-caption">{r.title}</b>
							<span className="text-2xs text-muted-foreground">
								{several && `${cert(r.certification)} · `}
								{r.failed} of {plural(r.checks, "check")} failed
							</span>
						</button>
					))}
				</div>
			)}
		</ModuleCard>
	);
}

/** This week in figures: time, attempts, and each day's time against the plans */
export function ThisWeek({
	minutes,
	attempts,
	plans,
	weekStart,
}: {
	minutes: Map<string, number>;
	attempts: number;
	plans: PlanView[] | null;
	weekStart: Date;
}) {
	const today = dayKey(new Date());
	const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)));
	const total = days.reduce((n, d) => n + (minutes.get(d) ?? 0), 0);
	const most = Math.max(60, ...days.map(d => minutes.get(d) ?? 0));
	const planned = new Set((plans ?? []).filter(p => p.done === null).map(p => p.day));
	return (
		<ModuleCard
			title={
				<>
					This week{" "}
					<span className="font-normal text-muted-foreground">
						{parseDay(days[0]).toLocaleDateString(undefined, { day: "numeric", month: "short" })} –{" "}
						{parseDay(days[6]).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
					</span>
				</>
			}
			link={{ to: `/calendar?day=${days[0]}`, label: "Calendar" }}
		>
			<div className="flex min-h-0 flex-1 items-end justify-between gap-4">
				<div className="flex flex-col">
					<span className="font-semibold text-title tabular-nums leading-none">
						{(total / 60).toFixed(1)}
					</span>
					<span className="text-caption text-muted-foreground">
						hours · {plural(attempts, "attempt")}
					</span>
				</div>
				<div
					className="flex h-full items-end gap-1.5"
					role="img"
					aria-label={`${Math.round(total)} minutes practised this week`}
				>
					{days.map(d => {
						const m = minutes.get(d) ?? 0;
						return (
							<span
								key={d}
								className="flex h-full w-5 flex-col items-center justify-end gap-1 text-3xs text-muted-foreground"
							>
								<i
									className={cn(
										"w-full rounded-[3px]",
										m
											? "bg-success"
											: planned.has(d) && d >= today
												? "ring-[1.5px] ring-highlight ring-inset"
												: "bg-fill-quiet"
									)}
									style={{ height: m ? `${Math.max(12, (m * 100) / most)}%` : 6 }}
								/>
								{parseDay(d).toLocaleDateString(undefined, { weekday: "narrow" })}
							</span>
						);
					})}
				</div>
			</div>
		</ModuleCard>
	);
}

/** The latest attempts, a row each; the module grows with them, then scrolls */
export function Recent({ history, several }: { history: HistoryEntry[]; several: boolean }) {
	const rows = history.slice(0, 20);
	return (
		<ModuleCard
			title="Recent"
			link={history.length ? { to: "/history", label: `All ${history.length}` } : undefined}
		>
			{rows.length === 0 ? (
				<p className="text-caption text-muted-foreground">Your attempts show here</p>
			) : (
				<ModuleScroll>
					{rows.map(h => {
						const minutes = Math.round(
							((h.result.finished_at ?? startedAt(h)) - startedAt(h)) / 60_000
						);
						const score = scoreOf(h);
						return (
							<div
								key={h.attempt_id}
								className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto_3rem] items-center gap-3 border-border border-b py-1.5 text-caption last:border-0"
							>
								<span className="text-muted-foreground">
									{new Date(startedAt(h)).toLocaleDateString(undefined, {
										weekday: "short",
										day: "numeric",
										month: "short",
									})}
								</span>
								<span className="truncate">{shortTitle(h.title)}</span>
								<span className="text-muted-foreground">
									{h.mode === "exam" ? "Exam" : "Practice"} · {minutes} min
									{several && h.certification ? ` · ${cert(h.certification)}` : ""}
								</span>
								<b
									className="text-right tabular-nums"
									style={{ color: worked(h) ? scoreColor(score, h.pass_score) : undefined }}
								>
									{Math.round(score)}%
								</b>
							</div>
						);
					})}
				</ModuleScroll>
			)}
		</ModuleCard>
	);
}

/** Ask Claude for an exam: what it should be, or one of the suggestions
 * the attempts point to; Create carries it to the Create screen */
export function AskClaude({ suggestions }: { suggestions: string[] }) {
	const [text, setText] = useState("");
	const navigate = useNavigate();
	const ask = (value: string) =>
		value.trim() && navigate(`/create?ask=${encodeURIComponent(value.trim())}`);
	return (
		<ModuleCard
			title={
				<span className="flex items-center gap-1.5">
					<AssistantIcon className="size-3.5 text-assistant" /> Make an exam with Claude
				</span>
			}
			className="bg-assistant/[0.07]"
		>
			<Textarea
				value={text}
				onChange={e => setText(e.target.value)}
				placeholder="Describe the exam you want: the topics, how long, how hard…"
				aria-label="The exam you want"
				rows={3}
				className="min-h-0 flex-1 resize-none"
			/>
			<div className="mt-2.5 flex flex-wrap gap-1.5">
				{suggestions.map(s => (
					<button
						key={s}
						type="button"
						onClick={() => ask(s)}
						className="rounded-full px-2.5 py-0.5 text-caption ring-1 ring-assistant/40 ring-inset hover:bg-assistant/10"
					>
						{s}
					</button>
				))}
			</div>
			<div className="mt-2.5 flex items-center gap-3">
				<span className="min-w-0 flex-1 text-2xs text-muted-foreground">
					Claude reads your readiness, failed checks and plans. Nothing is saved until you verify
					it.
				</span>
				<Button size="push" variant="assistant" disabled={!text.trim()} onClick={() => ask(text)}>
					Create
				</Button>
			</div>
		</ModuleCard>
	);
}

/** An exam tried and not passed yet: its title, best score and pass line */
export type Unpassed = { examId: string; title: string; best: number; pass: number };

/** The exams tried and not passed yet, the latest on top of a small fan;
 * Continue practises it again */
export function InProgress({ exams }: { exams: Unpassed[] }) {
	const start = useExam(s => s.start);
	const busy = useExamBusy();
	const top = exams[0];
	const tints = ["bg-highlight/80", "bg-assistant/80", "bg-warning/80"];
	return (
		<ModuleCard className="relative">
			<span className="font-semibold text-title tabular-nums leading-none">{exams.length}</span>
			<span className="text-caption text-muted-foreground">
				{exams.length ? "not passed yet" : "Every exam tried is passed"}
			</span>
			{top && (
				<button
					type="button"
					disabled={busy}
					onClick={() => start(top.examId, "practice")}
					className="absolute top-3.5 right-4 z-10 flex items-center text-caption text-highlight hover:underline disabled:opacity-50"
				>
					Continue
					<ChevronRight className="size-3.5" />
				</button>
			)}
			<div aria-hidden className="absolute right-3 -bottom-5 h-20 w-28">
				{exams.slice(0, 3).map((e, i) => (
					<span
						key={e.examId}
						className={cn(
							"absolute bottom-0 h-[70px] w-14 rounded-md p-1.5 font-semibold text-[9px] text-white leading-tight shadow-(--shadow-control)",
							tints[i],
							i === 0
								? "left-6 z-[2] rotate-2"
								: i === 1
									? "left-0 -rotate-6"
									: "left-12 rotate-[10deg]"
						)}
					>
						{shortTitle(e.title)}
					</span>
				))}
			</div>
		</ModuleCard>
	);
}
