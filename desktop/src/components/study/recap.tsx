import { Button } from "@ckdry/ui/components/button";
import { useNavigate } from "react-router";
import { shortTitle } from "@/titles";
import type { weekRecap } from "./data";

/**
 * A stretch of study in a few figures (a week, or a month), the domain to
 * work on next, and a way to plan what follows
 */
export function Recap({
	title,
	recap,
	next,
	action,
}: {
	title: string;
	recap: ReturnType<typeof weekRecap>;
	next: { domain: string; percent: number } | null;
	action: { label: string; to: string };
}) {
	const navigate = useNavigate();
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
				<div className="font-semibold text-lead">{title}</div>
				<ul className="mt-0.5 flex flex-wrap gap-x-5 gap-y-1 text-callout text-muted-foreground [&_b]:text-foreground">
					{items.map((item, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
						<li key={i}>{item}</li>
					))}
				</ul>
			</div>
			<Button size="push" variant="push" onClick={() => navigate(action.to)}>
				{action.label}
			</Button>
		</section>
	);
}
