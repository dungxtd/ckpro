import { Button } from "@ckpro/ui/components/button";
import { Progress, ProgressRing } from "@ckpro/ui/components/progress";
import { ModuleCard } from "@/components/home/modules/module-card";
import { PASS_DEFAULT, scoreTone } from "@/components/study/data";
import type { ExamReadiness } from "@/tauri/api";
import { certName, NONE } from "@/words";

/** An exam's readiness as Home reads it: being read, read, or not read */
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
						<span className="text-callout">{score === null ? NONE : `${Math.round(score)}%`}</span>
					</ProgressRing>
					<div className="min-w-0">
						<div className="font-semibold text-callout">Readiness</div>
						<div className="text-caption text-muted-foreground">
							{certName(measured[0].certification)} · pass {r?.pass_score ?? PASS_DEFAULT}%
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
					const pass = m.readiness?.pass_score ?? PASS_DEFAULT;
					return (
						<div key={m.certification} className="contents">
							<span>{certName(m.certification)}</span>
							{score === null ? (
								<span className="col-span-2 text-muted-foreground">not measured</span>
							) : (
								<>
									<Progress
										value={score}
										marker={pass}
										tone={scoreTone(score, pass)}
										label={`${certName(m.certification)} predicted`}
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
