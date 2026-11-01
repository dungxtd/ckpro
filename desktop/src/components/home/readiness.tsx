import { Button } from "@ckdry/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@ckdry/ui/components/card";
import { Placeholder } from "@ckdry/ui/components/placeholder";
import { Progress } from "@ckdry/ui/components/progress";
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
		<Card padding="lg">
			<CardHeader className="mb-2">
				<CardTitle>Readiness</CardTitle>
				{measured.length > 0 && (
					<CardDescription>
						{score === null
							? `${measured.length} of ${domains.length} domains measured`
							: `predicted ${Math.round(score)}%, ${readiness?.window_days ? "last 30 days" : "all attempts"}`}
					</CardDescription>
				)}
			</CardHeader>
			{measured.length === 0 ? (
				<Placeholder
					sample={[60, 45, 80, 35].map((value, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a fixed sample
						<Bar key={i} name="domain" weight={25} percent={value} pass={pass} />
					))}
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
					{score === null && (
						<p className="text-caption text-muted-foreground">
							A predicted score shows once {PREDICT_COVERAGE}% of the exam is measured (
							{readiness?.coverage}% now).
						</p>
					)}
					{measured.map(d => (
						<Bar
							key={d.domain}
							name={d.domain.replaceAll("-", " ")}
							weight={d.weight}
							percent={(d.points * 100) / d.max_points}
							pass={pass}
						/>
					))}
					{untested.length > 0 && (
						<div className="mt-2.5 flex justify-between gap-3 text-caption text-muted-foreground">
							<span className="capitalize">
								{untested.map(d => d.domain.replaceAll("-", " ")).join(", ")}
							</span>
							<span className="shrink-0">not measured</span>
						</div>
					)}
					<div className="mt-3 flex gap-2">
						{onPractise && (
							<Button size="push" variant="push" onClick={onPractise}>
								Practise the weakest
							</Button>
						)}
						{untested.length > 0 && onMeasure && (
							<Button size="push" variant="push" onClick={onMeasure}>
								Measure the rest
							</Button>
						)}
					</div>
				</>
			)}
		</Card>
	);
}

/** A domain's share against the pass line */
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
		<div className="mt-2.5">
			<div className="flex justify-between text-caption">
				<span className="capitalize">
					{name} <span className="text-muted-foreground">{weight}%</span>
				</span>
				<b className={TEXT[t]}>{Math.round(percent)}%</b>
			</div>
			<Progress
				value={percent}
				tone={t}
				marker={pass}
				label={`${name} score`}
				// On a card, the track needs more than the card's own grey
				className="mt-1.5 bg-foreground/10"
			/>
		</div>
	);
}
