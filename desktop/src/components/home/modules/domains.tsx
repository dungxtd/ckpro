import { Button } from "@ckpro/ui/components/button";
import { Placeholder } from "@ckpro/ui/components/placeholder";
import { Progress } from "@ckpro/ui/components/progress";
import { ModuleCard, ModuleScroll } from "@/components/home/modules/module-card";
import type { Measured } from "@/components/home/modules/readiness";
import { PASS_DEFAULT, scoreTone } from "@/components/study/data";
import { certName, domainName } from "@/words";

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
								<div className="text-2xs text-muted-foreground">{certName(g.certification)}</div>
							)}
							{g.domains.map(d => {
								const percent = (d.points * 100) / d.max_points;
								const pass = g.readiness?.pass_score ?? PASS_DEFAULT;
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
