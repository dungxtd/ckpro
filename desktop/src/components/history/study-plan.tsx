import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import { Spinner } from "@ckdry/ui/components/spinner";
import { cn } from "@ckdry/ui/lib/utils";
import { Sparkles, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import {
	ApiError,
	type CoachStatus,
	coachApi,
	type DomainStat,
	type StudyStats,
} from "@/tauri/api";

/** Passing is 66% on the CKA/CKAD/CKS */
const tone = (percent: number) =>
	percent >= 66 ? "bg-success" : percent >= 40 ? "bg-warning" : "bg-destructive";

/**
 * Where the candidate stands per curriculum domain (from every finished
 * attempt), and a study plan the coach writes from it.
 */
export function StudyPlan() {
	const [stats, setStats] = useState<StudyStats[]>([]);
	const [cert, setCert] = useState<string | null>(null);
	const [plan, setPlan] = useState("");
	const [writing, setWriting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<CoachStatus | null>(null);

	useEffect(() => {
		coachApi.studyStats().then(all => {
			setStats(all);
			setCert(c => c ?? all[0]?.certification ?? null);
		});
		coachApi.status().then(setStatus);
	}, []);
	useEffect(() => {
		if (!cert) return;
		setPlan("");
		setError(null);
		coachApi.lastStudyPlan(cert).then(last => setPlan(last ?? ""));
	}, [cert]);

	const current = stats.find(s => s.certification === cert);
	if (!current) return null;

	const write = async () => {
		setWriting(true);
		setError(null);
		setPlan("");
		try {
			setPlan(await coachApi.studyPlan(current.certification, t => setPlan(p => p + t)));
		} catch (e) {
			if (!(e instanceof ApiError && e.code === "cancelled"))
				setError(e instanceof ApiError ? e.message : String(e));
		} finally {
			setWriting(false);
		}
	};

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="font-semibold">Study plan</h2>
				{stats.length > 1 && (
					<SegmentedControl
						label="Certification"
						value={current.certification}
						onChange={setCert}
						options={stats.map(s => ({
							value: s.certification,
							label: s.certification.toUpperCase(),
						}))}
					/>
				)}
				<span className="text-muted-foreground text-sm">
					{current.scores.length} attempt{current.scores.length === 1 ? "" : "s"} · last{" "}
					{current.scores.at(-1)?.toFixed(0)}%
				</span>
			</div>

			<Card padding="none" className="overflow-hidden">
				<table className="w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
					<thead className="bg-muted/50 text-left text-muted-foreground text-xs">
						<tr>
							<th className="font-medium">Domain</th>
							<th className="w-24 font-medium">Exam weight</th>
							<th className="w-1/3 font-medium">Your score</th>
							<th className="w-24 font-medium">Answered</th>
						</tr>
					</thead>
					<tbody>
						{current.domains.map(d => (
							<DomainRow key={d.domain} domain={d} />
						))}
					</tbody>
				</table>
			</Card>

			<div className="flex items-center gap-2">
				{writing ? (
					<Button size="push" variant="push" onClick={() => coachApi.cancel()}>
						<Square /> Stop
					</Button>
				) : (
					<Button
						size="push"
						variant="pushDefault"
						disabled={status !== null && !status.ready}
						onClick={write}
					>
						<Sparkles /> {plan ? "Write a new study plan" : "Write my study plan"}
					</Button>
				)}
				<span className="text-muted-foreground text-xs">
					{status && !status.ready
						? status.problem
						: "By the coach, from your results and the curriculum weights (Claude, your Claude plan)."}
				</span>
			</div>
			{error && <Alert variant="destructive">{error}</Alert>}
			{(plan || writing) && (
				<Card className="select-text">
					{plan ? (
						<Markdown>{plan}</Markdown>
					) : (
						<span className="flex items-center gap-2 text-muted-foreground text-sm">
							<Spinner size="inline" /> Reading your results…
						</span>
					)}
				</Card>
			)}
		</section>
	);
}

function DomainRow({ domain: d }: { domain: DomainStat }) {
	const percent = d.max_points ? Math.round((d.points * 100) / d.max_points) : null;
	return (
		<tr className="border-border border-t">
			<td className="capitalize">{d.domain.replaceAll("-", " ")}</td>
			<td className="tabular-nums">{d.weight}%</td>
			<td>
				{percent === null ? (
					<span className="text-muted-foreground">Not tested yet</span>
				) : (
					<span className="flex items-center gap-2">
						<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
							<span
								className={cn("block h-full rounded-full", tone(percent))}
								style={{ width: `${percent}%` }}
							/>
						</span>
						<span className="w-10 text-right tabular-nums">{percent}%</span>
					</span>
				)}
			</td>
			<td className="tabular-nums">{d.questions}</td>
		</tr>
	);
}
