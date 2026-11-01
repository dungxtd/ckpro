import { Button } from "@ckdry/ui/components/button";
import { useNavigate } from "react-router";
import { addDays, dayKey } from "@/days";
import { shortTitle } from "@/titles";
import type { weekRecap } from "./data";

/** The week so far, in a few figures, and the domain to work on next */
export function Recap({
	recap,
	weekStart,
	next,
}: {
	recap: ReturnType<typeof weekRecap>;
	weekStart: Date;
	next: { domain: string; percent: number } | null;
}) {
	const navigate = useNavigate();
	const range = `${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} to ${addDays(weekStart, 6).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
	const items = [
		<>
			<b>{recap.days}</b> day{recap.days === 1 ? "" : "s"} studied, <b>{recap.attempts}</b> attempt
			{recap.attempts === 1 ? "" : "s"}
		</>,
		recap.best && (
			<>
				best <b>{Math.round(recap.best.score)}%</b> ({shortTitle(recap.best.title)})
			</>
		),
		...recap.firstPasses.map(t => (
			<>
				first pass of <b>{shortTitle(t)}</b>
			</>
		)),
		next && (
			<>
				next: <b>{next.domain.replaceAll("-", " ")}</b>, {Math.round(next.percent)}%
			</>
		),
	].filter(Boolean);
	return (
		<section className="flex items-center gap-4 rounded-2xl border border-highlight/30 bg-highlight/10 px-4 py-3">
			<div className="min-w-0 flex-1">
				<div className="font-semibold text-lead">Your week, {range}</div>
				<ul className="mt-0.5 flex flex-wrap gap-x-5 gap-y-1 text-callout text-muted-foreground [&_b]:text-foreground">
					{items.map((item, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
						<li key={i}>{item}</li>
					))}
				</ul>
			</div>
			<Button
				size="push"
				variant="push"
				onClick={() => navigate(`/calendar?view=week&day=${dayKey(addDays(weekStart, 7))}`)}
			>
				Plan next week
			</Button>
		</section>
	);
}
