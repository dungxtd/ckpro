import { Button } from "@ckdry/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@ckdry/ui/components/card";
import { Placeholder } from "@ckdry/ui/components/placeholder";
import { Progress } from "@ckdry/ui/components/progress";
import { cn } from "@ckdry/ui/lib/utils";
import type * as React from "react";
import { PREDICT_COVERAGE, predicted, scoreTone } from "@/components/study/data";
import type { ExamReadiness } from "@/tauri/api";

const TEXT = { success: "text-success", warning: "text-warning", destructive: "text-destructive" };

/**
 * Each measured domain against the pass line, heaviest first; the domains
 * not measured yet in one line; the predicted score once enough of the
 * exam is measured. Nothing measured: what it will show, and how to fill it
 */
export function Readiness({
	readiness,
	onMeasure,
	onPractise,
}: {
	/** None without a certification to measure */
	readiness: ExamReadiness | null;
	/** Start an attempt that measures the domains (a full mock) */
	onMeasure: (() => void) | null;
	/** Practise the weakest domain */
	onPractise: (() => void) | null;
}) {
	const domains = readiness?.domains ?? [];
	const measured = domains.filter(d => d.max_points > 0);
	const untested = domains.filter(d => !d.max_points);
	const score = predicted(readiness);
	const pass = readiness?.pass_score ?? 66;
	return (
		<Card padding="lg" className="@container">
			<CardHeader className="mb-2">
				<CardTitle>Readiness</CardTitle>
				{measured.length > 0 && (
					// Short enough to stay on the title's line; the rest on hover
					<CardDescription
						title={
							score === null
								? `A score is predicted once ${PREDICT_COVERAGE}% of the exam is measured`
								: readiness?.window_days
									? "From the last 30 days"
									: "From all attempts"
						}
					>
						{score === null
							? `${measured.length} of ${domains.length} measured`
							: `${Math.round(score)}% predicted`}
					</CardDescription>
				)}
			</CardHeader>
			{measured.length === 0 ? (
				<Placeholder
					sample={
						<Bars>
							{[60, 45, 80, 35, 70].map((value, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: a fixed sample
								<Bar key={i} name="domain" weight={20} percent={value} pass={pass} />
							))}
						</Bars>
					}
					title={readiness ? "Take a full mock to measure" : "Set a target to measure"}
					description={
						readiness
							? `Each of the ${domains.length} ${readiness.certification.toUpperCase()} domains against the pass line`
							: "How ready you are, domain by domain"
					}
					action={
						onMeasure && (
							<Button size="push" variant="push" onClick={onMeasure}>
								Start a mock
							</Button>
						)
					}
				/>
			) : (
				<>
					<Bars>
						{measured.map(d => (
							<Bar
								key={d.domain}
								name={d.domain.replaceAll("-", " ")}
								weight={d.weight}
								percent={(d.points * 100) / d.max_points}
								pass={pass}
							/>
						))}
						{untested.map(d => (
							<Untested key={d.domain} name={d.domain.replaceAll("-", " ")} weight={d.weight} />
						))}
					</Bars>
					{/* One next step: measure what is not yet, else practise the weakest */}
					{untested.length > 0 && onMeasure ? (
						<Button size="push" variant="push" className="mt-3" onClick={onMeasure}>
							Measure the rest
						</Button>
					) : (
						onPractise && (
							<Button size="push" variant="push" className="mt-3" onClick={onPractise}>
								Practise the weakest
							</Button>
						)
					)}
				</>
			)}
		</Card>
	);
}

/** The domains one line each, their bars lined up in one column */
function Bars({ children }: { children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[fit-content(60%)_minmax(3rem,1fr)_2.5rem] items-center gap-x-3 gap-y-2 text-caption">
			{children}
		</div>
	);
}

const Name = ({ name, weight }: { name: string; weight: number }) => (
	<span className="truncate capitalize">
		{name} <span className="hidden text-muted-foreground @[17rem]:inline">{weight}%</span>
	</span>
);

/** A domain's share against the pass line, on one line */
function Bar({
	name,
	weight,
	percent,
	pass,
}: {
	name: string;
	weight: number;
	percent: number;
	pass: number;
}) {
	const t = scoreTone(percent, pass);
	return (
		<>
			<Name name={name} weight={weight} />
			<Progress
				value={percent}
				tone={t}
				marker={pass}
				label={`${name} score`}
				// On a card, the track needs more than the card's own grey
				className="bg-foreground/10"
			/>
			<b className={cn("text-right", TEXT[t])}>{Math.round(percent)}%</b>
		</>
	);
}

/** A domain no attempt measured yet */
function Untested({ name, weight }: { name: string; weight: number }) {
	return (
		<>
			<Name name={name} weight={weight} />
			<span className="col-span-2 text-right text-muted-foreground">not measured</span>
		</>
	);
}
