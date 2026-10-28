import { Alert } from "@ckdry/ui/components/alert";
import { Button } from "@ckdry/ui/components/button";
import { Card } from "@ckdry/ui/components/card";
import { Progress, type ProgressTone } from "@ckdry/ui/components/progress";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import { Spinner } from "@ckdry/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ckdry/ui/components/table";
import { Square } from "lucide-react";
import { useEffect, useState } from "react";
import { ClaudeIcon } from "@/components/claude-icon";
import { Markdown } from "@/components/markdown";
import {
	ApiError,
	type CoachStatus,
	coachApi,
	type DomainStat,
	type StudyStats,
} from "@/tauri/api";

/** Passing is 66% on the CKA/CKAD/CKS */
const tone = (percent: number): ProgressTone =>
	percent >= 66 ? "success" : percent >= 40 ? "warning" : "destructive";

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

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Domain</TableHead>
						<TableHead className="w-24">Exam weight</TableHead>
						<TableHead className="w-1/3">Your score</TableHead>
						<TableHead className="w-24">Answered</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{current.domains.map(d => (
						<DomainRow key={d.domain} domain={d} />
					))}
				</TableBody>
			</Table>

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
						<ClaudeIcon /> {plan ? "Write a new study plan" : "Write my study plan"}
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
		<TableRow>
			<TableCell className="capitalize">{d.domain.replaceAll("-", " ")}</TableCell>
			<TableCell className="tabular-nums">{d.weight}%</TableCell>
			<TableCell>
				{percent === null ? (
					<span className="text-muted-foreground">Not tested yet</span>
				) : (
					<span className="flex items-center gap-2">
						<Progress
							value={percent}
							tone={tone(percent)}
							label={`${d.domain} score`}
							className="flex-1"
						/>
						<span className="w-10 text-right tabular-nums">{percent}%</span>
					</span>
				)}
			</TableCell>
			<TableCell className="tabular-nums">{d.questions}</TableCell>
		</TableRow>
	);
}
