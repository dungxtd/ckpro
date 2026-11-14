import { Badge } from "@ckpro/ui/components/badge";
import { Progress } from "@ckpro/ui/components/progress";
import { SectionTitle } from "@ckpro/ui/components/section-title";
import { SegmentedControl } from "@ckpro/ui/components/segmented-control";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ckpro/ui/components/table";

import { useState } from "react";
import { PASS_DEFAULT, scoreTone } from "@/components/study/data";
import { useStudy } from "@/stores/study";
import type { DomainStat } from "@/tauri/api";
import { certName, domainName, plural } from "@/words";

/** Passing is 66% on the CKA/CKAD/CKS */
const PASS = PASS_DEFAULT;

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
	const stats = useStudy(s => s.stats);
	const [picked, setCert] = useState<string | null>(null);
	const cert = picked ?? stats[0]?.certification ?? null;

	const current = stats.find(s => s.certification === cert);
	if (!current) return null;
	const next = focus(current.domains);

	return (
		<section className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-3">
				<SectionTitle>By domain</SectionTitle>
				{stats.length > 1 && (
					<SegmentedControl
						label="Certification"
						value={current.certification}
						onChange={setCert}
						options={stats.map(s => ({
							value: s.certification,
							label: certName(s.certification),
						}))}
					/>
				)}
				<span className="text-muted-foreground text-sm tabular-nums">
					{/* Attempts ended before any point are listed below, not counted here */}
					{plural(current.scores.length, "scored attempt")} · last{" "}
					{current.scores.at(-1)?.toFixed(0)}%
				</span>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Domain</TableHead>
						<TableHead className="w-24">Exam weight</TableHead>
						<TableHead className="w-1/3">Your score</TableHead>
						{/* Questions met in the domain, over the scored attempts: answered or not */}
						<TableHead className="w-24">Questions</TableHead>
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
					<span className="capitalize">{domainName(d.domain)}</span>
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
							tone={scoreTone(percent, PASS)}
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
