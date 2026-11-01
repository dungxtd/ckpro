import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Progress } from "@ckdry/ui/components/progress";
import { useNavigate } from "react-router";
import type { ExamReadiness } from "@/tauri/api";

/** Each domain against the pass line, heaviest first, with the predicted score */
export function Readiness({ readiness }: { readiness: ExamReadiness }) {
	const navigate = useNavigate();
	const pass = readiness.pass_score;
	return (
		<Card padding="lg">
			<div className="mb-2 flex items-baseline justify-between">
				<h2 className="font-semibold text-lead">Readiness</h2>
				<span className="text-caption text-muted-foreground">
					{readiness.predicted == null
						? "no results yet"
						: `predicted ${Math.round(readiness.predicted)}%, ${readiness.window_days ? "last 30 days" : "all attempts"}`}
				</span>
			</div>
			{readiness.domains.map(d => {
				const percent = d.max_points ? (d.points * 100) / d.max_points : null;
				return (
					<div key={d.domain} className="mt-2.5">
						<div className="flex justify-between text-caption">
							<span className="capitalize">
								{d.domain.replaceAll("-", " ")}{" "}
								<span className="text-muted-foreground">{d.weight}%</span>
							</span>
							<b
								className={
									percent == null
										? "text-muted-foreground"
										: percent >= pass
											? "text-success"
											: percent >= 40
												? "text-warning"
												: "text-destructive"
								}
							>
								{percent == null ? "not tested" : `${Math.round(percent)}%`}
							</b>
						</div>
						<div className="relative mt-1.5 h-1.5">
							<Progress
								value={percent ?? 0}
								tone={
									percent == null
										? "highlight"
										: percent >= pass
											? "success"
											: percent >= 40
												? "warning"
												: "destructive"
								}
								label={`${d.domain} score`}
								// On a card, the track needs more than the card's own grey
								className="bg-foreground/10"
							/>
							{/* The pass line */}
							<span
								className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-foreground/80"
								style={{ left: `${pass}%` }}
							/>
						</div>
					</div>
				);
			})}
			<Button size="push" variant="push" className="mt-3" onClick={() => navigate("/exams")}>
				Practise the weakest
			</Button>
		</Card>
	);
}
