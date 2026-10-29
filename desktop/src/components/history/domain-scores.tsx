import { Badge } from "@ckdry/ui/components/badge";
import { Progress, type ProgressTone } from "@ckdry/ui/components/progress";
import { SegmentedControl } from "@ckdry/ui/components/segmented-control";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ckdry/ui/components/table";
import { useEffect, useState } from "react";
import { type DomainStat, examApi, type StudyStats } from "@/tauri/api";

/** Passing is 66% on the CKA/CKAD/CKS */
const PASS = 66;
const tone = (percent: number): ProgressTone =>
	percent >= PASS ? "success" : percent >= 40 ? "warning" : "destructive";

export const percentOf = (d: DomainStat) => (d.max_points ? (d.points * 100) / d.max_points : null);

/** The domains to practise next: below passing or not tested yet, the
 * heaviest in the exam first, two at most */
export const focus = (domains: DomainStat[]) =>
	new Set(
		domains
			.filter(d => (percentOf(d) ?? 0) < PASS)
			.sort((a, b) => b.weight - a.weight)
			.slice(0, 2)
			.map(d => d.domain)
	);

/** Where the candidate stands per curriculum domain, from every finished attempt */
export function DomainScores() {
	const [stats, setStats] = useState<StudyStats[]>([]);
	const [cert, setCert] = useState<string | null>(null);
	useEffect(() => {
		examApi.studyStats().then(all => {
			setStats(all);
			setCert(c => c ?? all[0]?.certification ?? null);
		});
	}, []);

	const current = stats.find(s => s.certification === cert);
	if (!current) return null;
	const next = focus(current.domains);

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="font-semibold">By domain</h2>
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
						<DomainRow key={d.domain} domain={d} next={next.has(d.domain)} />
					))}
				</TableBody>
			</Table>
		</section>
	);
}

function DomainRow({ domain: d, next }: { domain: DomainStat; next: boolean }) {
	const percent = percentOf(d);
	return (
		<TableRow>
			<TableCell>
				<span className="flex items-center gap-2">
					<span className="capitalize">{d.domain.replaceAll("-", " ")}</span>
					{next && <Badge variant="warningTag">Practise next</Badge>}
				</span>
			</TableCell>
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
						<span className="w-10 text-right tabular-nums">{Math.round(percent)}%</span>
					</span>
				)}
			</TableCell>
			<TableCell className="tabular-nums">{d.questions}</TableCell>
		</TableRow>
	);
}
